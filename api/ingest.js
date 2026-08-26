import { getSql } from './db.js';

const SUPPORTED = new Set(['telemetry','mx2001','rock','rock_test','sandstone','motion']);
const EXPERIMENT_TYPES = new Set(['telemetry','rock','rock_test','sandstone','motion']);
// Current Navajo sandstone experiment node (CCS3 / !5b0782f5).
// MX2001 records are intentionally exempt so the established water-level pipeline keeps working.
const EXPERIMENT_NODE_NUM = Number(process.env.EXPERIMENT_NODE_NUM || 1527161333);

function parsePossibleJson(value){if(typeof value!=='string')return value;try{return JSON.parse(value)}catch{return value}}
function unwrapBody(input){let body=parsePossibleJson(input);for(let i=0;i<4;i+=1){if(!body||typeof body!=='object'||Array.isArray(body))break;if(SUPPORTED.has(body.type)&&body.payload&&typeof body.payload==='object')return body;const candidates=[body.payload,body.body,body.message,body.data];const next=candidates.map(parsePossibleJson).find(v=>v&&typeof v==='object'&&!Array.isArray(v));if(!next||next===body)break;body=next}return body}
function readIngestKey(req){const h=req.headers['x-ingest-key'];if(typeof h==='string')return h;const a=req.headers.authorization;if(typeof a==='string'&&a.startsWith('Bearer '))return a.slice(7);return''}
function finiteOrNull(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null}
function nodeNumber(body){const direct=finiteOrNull(body.from);if(direct!==null)return Math.trunc(direct);const explicit=finiteOrNull(body.node_num);if(explicit!==null)return Math.trunc(explicit);const source=body.sender||body.mesh_source;if(typeof source==='string'&&/^![0-9a-f]{8}$/i.test(source))return Number.parseInt(source.slice(1),16);return null}
function nodeHex(nodeNum){return Number.isFinite(nodeNum)?Math.trunc(nodeNum).toString(16).padStart(8,'0'):'unknown'}
function observedAtFor(body){const sec=finiteOrNull(body.timestamp);if(sec!==null&&sec>0)return new Date(sec*1000);if(typeof body.observed_at==='string'){const d=new Date(body.observed_at);if(Number.isFinite(d.getTime()))return d}return new Date()}
function stationNameFor(body,nodeNum,metrics){const supplied=body.station_name||body.station||body.sender_name||metrics?.station_name;if(typeof supplied==='string'&&supplied.trim())return supplied.trim();if(body.type==='rock'||body.type==='rock_test'||body.type==='sandstone'||body.type==='motion')return `Sandstone Node ${nodeHex(nodeNum)}`;const model=metrics?.sensor_model||metrics?.model;if(typeof model==='string'&&model.trim())return `${model.trim()} ${nodeHex(nodeNum)}`;return `Node ${nodeHex(nodeNum)}`}
function hasRockMetric(m){return ['rock_adc','soil_adc','moisture_adc','moisture_raw','adc_raw','motion_detected','motion','pir','motion_count'].some(k=>m?.[k]!==undefined&&m?.[k]!==null)}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'POST required'})}
  const expectedKey=process.env.INGEST_KEY;if(!expectedKey)return res.status(500).json({ok:false,error:'INGEST_KEY is not configured'});if(readIngestKey(req)!==expectedKey)return res.status(401).json({ok:false,error:'Unauthorized'});
  const body=unwrapBody(req.body);if(!body||typeof body!=='object'||Array.isArray(body))return res.status(400).json({ok:false,error:'Expected a JSON object'});if(!SUPPORTED.has(body.type))return res.status(202).json({ok:true,stored:false,reason:'Unsupported telemetry type'});
  const metrics=body.payload;if(!metrics||typeof metrics!=='object'||Array.isArray(metrics))return res.status(202).json({ok:true,stored:false,reason:'Telemetry has no metrics payload'});
  const nodeNum=nodeNumber(body);
  if(EXPERIMENT_TYPES.has(body.type)&&nodeNum!==EXPERIMENT_NODE_NUM)return res.status(202).json({ok:true,stored:false,reason:'Not the configured sandstone experiment node'});
  let telemetryType=body.type==='telemetry'?'environment':body.type;let temperatureC=finiteOrNull(metrics.temperature_c??metrics.temperature);
  if(body.type==='telemetry'&&temperatureC===null)return res.status(202).json({ok:true,stored:false,reason:'No temperature in telemetry payload'});
  if(['rock','rock_test','sandstone','motion'].includes(body.type)&&!hasRockMetric(metrics)&&temperatureC===null)return res.status(202).json({ok:true,stored:false,reason:'Rock packet has no supported metrics'});
  const observedAt=observedAtFor(body),stationName=stationNameFor(body,nodeNum,metrics),nestedRadio=body.radio&&typeof body.radio==='object'?body.radio:{};
  const radio={rssi:finiteOrNull(body.rssi??nestedRadio.rssi),snr:finiteOrNull(body.snr??nestedRadio.snr),hop_start:finiteOrNull(body.hop_start??nestedRadio.hop_start),hop_limit:finiteOrNull(body.hop_limit??nestedRadio.hop_limit),hops_away:finiteOrNull(body.hops_away??body.hops_used??nestedRadio.hops_away??nestedRadio.hops_used),relay_node:body.relay_node??nestedRadio.relay_node??null,relay_id:body.relay_id??nestedRadio.relay_id??null,relay_name:body.relay_name??nestedRadio.relay_name??null,channel:finiteOrNull(body.channel??nestedRadio.channel),gateway:body.sender??body.mesh_source??nestedRadio.gateway??null};
  try{const sql=getSql();const rows=await sql`INSERT INTO telemetry_readings (observed_at,node_num,station_name,telemetry_type,temperature_c,metrics,radio,raw) VALUES (${observedAt.toISOString()},${nodeNum},${stationName},${telemetryType},${temperatureC},${JSON.stringify(metrics)}::jsonb,${JSON.stringify(radio)}::jsonb,${JSON.stringify(body)}::jsonb) RETURNING id,observed_at,station_name,telemetry_type,temperature_c,metrics,radio`;return res.status(201).json({ok:true,stored:true,reading:rows[0]})}catch(error){console.error('Telemetry ingest failed',error);return res.status(500).json({ok:false,error:'Database insert failed'})}
}
