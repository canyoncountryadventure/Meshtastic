import { getSql } from './db.js';
import { timingSafeEqual } from 'node:crypto';
import { watershedSql, insertDirectCreekReading, processWatershedAlerts, ensureCreekPacketSchema } from '../lib/watershed-store.js';
import { isWatershedNode } from '../lib/watershed-nodes.js';
import { ensureDatabaseReady } from './rating-curves.js';
import { evaluateReadings, dispatchEmails } from '../lib/alerts.js';
import { backupRow, saveEmergencyBackup, stablePacketId } from '../lib/google-sheets-backup.js';

const KNOWN_STATIONS = new Map([
  [1252758033, 'Hidden Valley (retired)'],
  [1436900584, 'Hidden Valley (historic)'],
  [2224121796, 'Infra_i04 (historic)'], // !4aab9211, hidden from dashboard; retain incoming history
  [2740603892, 'Moab'],
  [1577197109, 'Fishlake Hightop'],
  [1949224949, "Pack Creek"],
  [2650172798, 'Thousand Lake Mountain'],
  [4241345683, 'Mini Me'], // !fccdcc93, formerly SMLA; portable RAK client
  [1222051909, 'Cottonwood Relay 2'], // !48d70845, RAK4631 router
  [2004386937, 'Matheson Groundwater'], // !77788479, GW01 groundwater well
  [1695962694, 'Cottonwood Creek'], // !65165646, CC01: MB stage and MX2001 stage/temperature
  [2425602407, 'Cottonwood Relay'], // !9093c167, CC02
  [3044869407, 'Hidden Valley'], // !b57d051f, formerly Revived; deployed October 16
  [1683604927, 'Mill Creek'], // !6459c5bf, Power Dam MX2001
  [647393146, 'Seed Relay 1'], // !26966f7a
]);

const ACCEPTED_TYPES = new Set(['telemetry', 'device', 'mx2001', 'rock_test', 'soil', 'water_distance']);
const PAUSED_INGEST_NODES = new Set([3388602087]);
const MAX_BATCH_SIZE = 64;

function parseJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function normalizeBodies(input) {
  const parsed = parseJson(input);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.batch)) return parsed.batch;
  return [parsed];
}

function readIngestKey(req) {
  const direct = req.headers['x-ingest-key'];
  if (typeof direct === 'string') return direct;
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  return '';
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nodeNumber(body) {
  const direct = finiteOrNull(body?.from ?? body?.node_num);
  if (direct !== null) return Math.trunc(direct);

  const source = body?.sender ?? body?.mesh_source;
  if (typeof source === 'string' && /^![0-9a-f]{8}$/i.test(source)) {
    return Number.parseInt(source.slice(1), 16);
  }
  return null;
}

function observedIso(body) {
  const seconds = finiteOrNull(body?.timestamp);
  if (seconds !== null && seconds > 0) {
    const d = new Date(seconds * 1000);
    if (Number.isFinite(d.getTime())) return d.toISOString();
  }

  if (typeof body?.observed_at === 'string') {
    const d = new Date(body.observed_at);
    if (Number.isFinite(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function telemetryType(body) {
  if (body.type === 'device') return 'device';
  if (body.type === 'mx2001') return 'mx2001';
  if (body.type === 'rock_test') return 'rock_test';
  if (body.type === 'soil') return 'soil';
  if (body.type === 'water_distance') return 'water_distance';
  return 'environment';
}

function temperatureC(body) {
  const p = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  return finiteOrNull(p.temperature_c ?? p.temperature);
}

function radioObject(body) {
  const nested = body?.radio && typeof body.radio === 'object' ? body.radio : {};
  return {
    rssi: finiteOrNull(body?.rssi ?? nested.rssi),
    snr: finiteOrNull(body?.snr ?? nested.snr),
    hop_start: finiteOrNull(body?.hop_start ?? nested.hop_start),
    hop_limit: finiteOrNull(body?.hop_limit ?? nested.hop_limit),
    hops_away: finiteOrNull(body?.hops_away ?? body?.hops_used ?? nested.hops_away ?? nested.hops_used),
    relay_node: body?.relay_node ?? nested.relay_node ?? null,
    relay_id: body?.relay_id ?? nested.relay_id ?? null,
    relay_name: body?.relay_name ?? nested.relay_name ?? null,
    channel: finiteOrNull(body?.channel ?? nested.channel),
    gateway: body?.gateway ?? body?.sender ?? body?.mesh_source ?? nested.gateway ?? null,
  };
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected a JSON object');
  }
  if (!ACCEPTED_TYPES.has(body.type)) {
    throw new Error(`Unsupported type: ${String(body.type)}`);
  }
  if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
    throw new Error('payload must be an object');
  }

  const nodeNum = nodeNumber(body);
  if (nodeNum === null) throw new Error('Missing node number/from');
  if (!KNOWN_STATIONS.has(nodeNum)) {
    throw new Error(`Node ${nodeNum} is not an approved telemetry station`);
  }

  if (body.type === 'telemetry' && temperatureC(body) === null) {
    throw new Error('Telemetry packet has no temperature');
  }
  // Type-specific validity: a soil node is not a temperature sensor; the
  // ultrasonic stage is only valid following field calibration.
  if (body.type === 'soil' &&
      (![2004386937, 4241345683, 3044869407].includes(nodeNum) || !Number.isFinite(Number(body.payload.soil_moisture_percent)) ||
       Number(body.payload.soil_moisture_percent) < 0 || Number(body.payload.soil_moisture_percent) > 100)) {
    throw new Error('Invalid soil moisture reading or source node');
  }
  if (body.type === 'water_distance' && ![1949224949, 1695962694, 2004386937].includes(nodeNum)) {
    throw new Error('Water-distance packets are only approved for Pack Creek and Cottonwood Creek');
  }

  return nodeNum;
}

let mainPacketSchema;
async function ensureMainPacketSchema(sql) {
  if (!mainPacketSchema) mainPacketSchema = (async () => {
    await sql`ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS packet_id TEXT`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS telemetry_readings_packet_id_uq ON telemetry_readings(packet_id) WHERE packet_id IS NOT NULL`;
  })().catch(error => { mainPacketSchema = null; throw error; });
  return mainPacketSchema;
}

function databaseUnavailable(error) {
  const message = String(error?.message || error || '').toLowerCase();
  const status = Number(error?.status || error?.statusCode || error?.cause?.status);
  return status === 402 || status === 408 || status === 429 || status >= 500 ||
    /quota|compute.*(limit|suspend|unavailable)|database.*unavailable|connection|connect|timeout|timed out|fetch failed|econn|enotfound|socket|network/.test(message);
}

async function insertReading(sql, body, packetId) {
  const nodeNum = validate(body);
  const observedAt = observedIso(body);
  const name = KNOWN_STATIONS.get(nodeNum);
  const type = telemetryType(body);
  const tempC = temperatureC(body);
  const metrics = JSON.stringify(body.payload);
  const radio = JSON.stringify(radioObject(body));
  const raw = JSON.stringify(body);

  const rows = await sql`
    INSERT INTO telemetry_readings
      (observed_at, node_num, station_name, telemetry_type, temperature_c, metrics, radio, raw, packet_id)
    VALUES
      (${observedAt}, ${nodeNum}, ${name}, ${type}, ${tempC},
       ${metrics}::jsonb, ${radio}::jsonb, ${raw}::jsonb, ${packetId})
    ON CONFLICT (packet_id) WHERE packet_id IS NOT NULL DO NOTHING
    RETURNING id, received_at, observed_at, node_num, station_name, telemetry_type, temperature_c, metrics, radio, FALSE AS duplicate
  `;
  if (rows[0]) return rows[0];
  return { duplicate: true, packet_id: packetId, node_num: nodeNum, station_name: name };
}

const valid=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);};
async function cc01ControlHandler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'GET or POST required'});
 if(!valid(req.headers['x-ingest-key'],process.env.INGEST_KEY))return res.status(401).json({error:'Unauthorized'});
 let body=req.body||{};
 try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({error:'Malformed JSON'});}
 try{
  const sql=watershedSql();
  if(req.method==='GET'){
   const rows=await sql`SELECT version,water_enabled,hobo_enabled,authorized_admin_node FROM cc01_gateway_control WHERE id=1`;
   if(!rows.length)return res.status(503).json({error:'Control not initialized'});
   const r=rows[0];return res.status(200).json({version:Number(r.version),water_enabled:r.water_enabled,hobo_enabled:r.hobo_enabled,authorized_admin_node:Number(r.authorized_admin_node)});
  }
  if(body.type==='report'){
   if(typeof body.water_enabled!=='boolean'||typeof body.hobo_enabled!=='boolean'||
     !Number.isSafeInteger(Number(body.version))||Number(body.version)<0)return res.status(400).json({error:'Invalid report'});
   await sql`UPDATE cc01_gateway_control SET applied_water_enabled=${body.water_enabled},applied_hobo_enabled=${body.hobo_enabled},
     applied_version=${Number(body.version)},applied_at=NOW() WHERE id=1`;
   return res.status(200).json({ok:true});
  }
  if(body.type==='event'){
   if(!['water','hobo'].includes(body.sensor)||!['timeout','ble_unavailable','read_failed'].includes(body.status)||
     !Number.isSafeInteger(Number(body.packet_id))||Number(body.packet_id)<0||Number(body.packet_id)>4294967295)
     return res.status(400).json({error:'Invalid station event'});
   await sql`INSERT INTO cc01_sensor_events(node_num,sensor,status,packet_id)
     VALUES(1695962694,${body.sensor},${body.status},${Number(body.packet_id)}) ON CONFLICT DO NOTHING`;
   return res.status(201).json({ok:true});
  }
  return res.status(400).json({error:'Unknown request'});
 }catch(error){console.error('CC01 control API unavailable',error.name);return res.status(503).json({error:'CC01 control unavailable'});}
}


export default async function handler(req, res) {
  if(req.query?.control==='cc01' || new URL(req.url||'/', 'http://localhost').searchParams.get('control')==='cc01')
    return cc01ControlHandler(req,res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST required' });
  }

  const expectedKey = process.env.INGEST_KEY;
  if (!expectedKey) return res.status(500).json({ ok: false, error: 'INGEST_KEY is not configured' });
  if (readIngestKey(req) !== expectedKey) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const bodies = normalizeBodies(req.body);
  if (!bodies.length) return res.status(400).json({ ok: false, error: 'Empty request' });
  if (bodies.length > MAX_BATCH_SIZE) return res.status(413).json({ ok: false, error: `Maximum ${MAX_BATCH_SIZE} readings` });

  try {
    const activeBodies = [];
    const paused = [];
    for (const rawBody of bodies) {
      const body = parseJson(rawBody);
      const nodeNum = nodeNumber(body);
      if (PAUSED_INGEST_NODES.has(nodeNum)) {
        paused.push({ node_num: nodeNum });
      } else {
        validate(body);
        activeBodies.push(body);
      }
    }

    // Acknowledge retired-node packets
    // without opening a Neon connection or writing a row.
    if (!activeBodies.length) {
      return res.status(200).json({ ok: true, stored: 0, paused: paused.length, paused_nodes: paused });
    }

    // All approved telemetry is stored once in moab_watersheds.
    // The former neondb archive remains read-only during migration.
    // Each record is committed independently and backed up on a DB outage.
    const sql = activeBodies.some(body => !isWatershedNode(nodeNumber(body))) ? getSql() : null;
    const creekSql = activeBodies.some(body => isWatershedNode(nodeNumber(body))) ? watershedSql() : null;
    const readings = [];
    const creekReadings = [];
    const backedUp = [];
    for (const body of activeBodies) {
      const node_num = nodeNumber(body);
      const packetId = stablePacketId(body);
      const watershed = isWatershedNode(node_num);
      try {
        let reading;
        if (watershed) {
          await ensureCreekPacketSchema(creekSql);
          reading = await insertDirectCreekReading(creekSql, {
            node_num, station_name: KNOWN_STATIONS.get(node_num), packet_id: packetId,
            observed_at: observedIso(body), telemetry_type: telemetryType(body),
            temperature_c: temperatureC(body), metrics: body.payload, radio: radioObject(body), raw: body,
          });
          if (!reading.duplicate) creekReadings.push(reading);
        } else {
          await ensureDatabaseReady(sql);
          await ensureMainPacketSchema(sql);
          reading = await insertReading(sql, body, packetId);
        }
        if (!reading.duplicate) readings.push(reading);
      } catch (error) {
        if (!databaseUnavailable(error)) throw error;
        const destination = watershed ? 'moab_watersheds' : 'neondb';
        const record = {
          packetId, row: backupRow({ body, packetId, nodeNum: node_num, stationName: KNOWN_STATIONS.get(node_num), observedAt: observedIso(body), destination }),
        };
        // This only acknowledges the gateway after Google confirms the append.
        try {
          await saveEmergencyBackup(record);
        } catch (backupError) {
          backupError.storageUnavailable = true;
          throw backupError;
        }
        backedUp.push({ packet_id: packetId, node_num, destination });
      }
    }

    // Alert failures must not reject a successfully stored measurement.
    // The primary alert engine still processes previously configured Pack Creek
    // thresholds, but never inserts Pack Creek telemetry into neondb.
    let alerts;
    let alertSql = sql;
    try {
      alertSql = alertSql || getSql();
      await evaluateReadings(alertSql, readings);
      alerts = await dispatchEmails(alertSql);
    } catch (error) {
      console.error('Alert processing failed', error.name);
      alerts = { processing: 'failed' };
    }
    if (creekReadings.length) {
      try { await processWatershedAlerts(creekSql,creekReadings,alertSql); }
      catch(error) { console.error('Watershed alert processing failed',error.name); }
    }

    return res.status(201).json({
      ok: true,
      stored: readings.length,
      backed_up: backedUp.length,
      backup: backedUp.length ? { active: true, records: backedUp } : undefined,
      alerts,
      paused: paused.length,
      paused_nodes: paused.length ? paused : undefined,
      reading: readings.length === 1 ? readings[0] : undefined,
      readings: readings.length > 1 ? readings : undefined,
    });
  } catch (error) {
    console.error('Telemetry ingest failed', error);
    return res.status(error?.storageUnavailable ? 503 : 400).json({ ok: false, error: error?.message || 'Telemetry ingest failed' });
  }
}

