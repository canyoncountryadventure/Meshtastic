import { createHash, createSign } from 'node:crypto';

const SHEET_NAME = 'Telemetry Backup';
const METADATA_KEY = 'meshtastic_packet_id';
let accessToken;
let accessTokenExpiresAt = 0;
let sheetId;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function serviceAccount() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!encoded || !process.env.GOOGLE_SHEETS_ID) return null;
  try { return JSON.parse(encoded); }
  catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON'); }
}

export function isGoogleSheetsBackupConfigured() {
  try {
    const account = serviceAccount();
    return Boolean(account?.client_email && account?.private_key && process.env.GOOGLE_SHEETS_ID);
  } catch { return false; }
}

async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken;
  const account = serviceAccount();
  if (!account?.client_email || !account?.private_key) throw new Error('Google Sheets backup is not configured');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  signer.end();
  const assertion = `${header}.${claim}.${signer.sign(account.private_key).toString('base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Google OAuth failed (${response.status})`);
  const body = await response.json();
  accessToken = body.access_token;
  accessTokenExpiresAt = Date.now() + Math.max(60, Number(body.expires_in || 3600) - 60) * 1000;
  return accessToken;
}

async function google(path, init = {}) {
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Google Sheets API failed (${response.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function getSheetId() {
  if (sheetId !== undefined) return sheetId;
  const data = await google(`spreadsheets/${encodeURIComponent(process.env.GOOGLE_SHEETS_ID)}?fields=sheets.properties`);
  const sheet = data.sheets?.find(item => item.properties?.title === SHEET_NAME);
  if (!sheet) throw new Error(`Google Sheets tab '${SHEET_NAME}' was not found`);
  sheetId = sheet.properties.sheetId;
  return sheetId;
}

export function stablePacketId(body) {
  const identity = body?.packet_id ?? body?.packetId ?? body?.id ?? body?.packet?.id;
  if (identity !== undefined && identity !== null && String(identity) !== '') return `mesh:${body?.from ?? body?.node_num ?? body?.sender ?? 'unknown'}:${identity}`;
  return `sha256:${createHash('sha256').update(canonicalJson(body)).digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function present(value) { return value === undefined || value === null ? '' : String(value); }
function metric(payload, names) { for (const name of names) if (payload?.[name] !== undefined && payload?.[name] !== null) return present(payload[name]); return ''; }

export function backupRow({ body, packetId, nodeNum, stationName, observedAt, destination }) {
  const payload = body.payload || {};
  const radio = body.radio && typeof body.radio === 'object' ? body.radio : {};
  const rssi = body.rssi ?? radio.rssi;
  const snr = body.snr ?? radio.snr;
  const battery = body.battery_percent ?? body.battery_voltage ?? payload.battery_percent ?? payload.battery_voltage;
  const telemetryType = body.type === 'telemetry' ? 'environment' : body.type;
  return [
    packetId, 'pending', destination, present(nodeNum), stationName, observedAt, new Date().toISOString(), telemetryType,
    metric(payload, ['water_level_ft', 'stage_ft', 'water_level', 'stage', 'distance']),
    metric(payload, ['water_temperature_c', 'water_temp_c', 'water_temperature']),
    metric(payload, ['temperature_c', 'temperature', 'air_temperature_c', 'soil_temperature_c']),
    metric(payload, ['soil_moisture_percent', 'soil_moisture']), present(battery), present(rssi), present(snr),
    JSON.stringify({ rssi: rssi ?? null, snr: snr ?? null, hop_start: body.hop_start ?? radio.hop_start ?? null, hop_limit: body.hop_limit ?? radio.hop_limit ?? null, hops_away: body.hops_away ?? body.hops_used ?? radio.hops_away ?? radio.hops_used ?? null, relay_node: body.relay_node ?? radio.relay_node ?? null, gateway: body.gateway ?? body.sender ?? body.mesh_source ?? radio.gateway ?? null }),
    JSON.stringify(payload), JSON.stringify(body), '', '0', ''
  ];
}

function stringCells(values) {
  return values.map(value => ({ userEnteredValue: { stringValue: String(value) } }));
}

async function packetExists(packetId) {
  const data = await google(`spreadsheets/${encodeURIComponent(process.env.GOOGLE_SHEETS_ID)}/developerMetadata:search`, {
    method: 'POST', body: JSON.stringify({ dataFilters: [{ developerMetadataLookup: { metadataKey: METADATA_KEY, metadataValue: packetId, visibility: 'DOCUMENT' } }] })
  });
  return Boolean(data.matchedDeveloperMetadata?.length);
}

export async function saveEmergencyBackup(record) {
  if (!isGoogleSheetsBackupConfigured()) throw new Error('Google Sheets backup is not configured');
  if (await packetExists(record.packetId)) return { duplicate: true };
  const targetSheetId = await getSheetId();
  await google(`spreadsheets/${encodeURIComponent(process.env.GOOGLE_SHEETS_ID)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [
      { appendCells: { sheetId: targetSheetId, rows: [{ values: stringCells(record.row) }], fields: 'userEnteredValue' } },
      { createDeveloperMetadata: { developerMetadata: { metadataKey: METADATA_KEY, metadataValue: record.packetId, visibility: 'DOCUMENT' } } }
    ] })
  });
  return { duplicate: false };
}

export async function pendingEmergencyBackups(limit = 100) {
  if (!isGoogleSheetsBackupConfigured()) return [];
  const end = Math.max(2, Math.min(5000, limit * 10 + 2));
  const range = encodeURIComponent(`${SHEET_NAME}!A2:U${end}`);
  const data = await google(`spreadsheets/${encodeURIComponent(process.env.GOOGLE_SHEETS_ID)}/values/${range}?majorDimension=ROWS`);
  return (data.values || []).map((row, index) => ({ rowNumber: index + 2, row: [...row, ...Array(Math.max(0, 21 - row.length)).fill('')] }))
    .filter(item => ['pending', 'retry'].includes(String(item.row[1]).toLowerCase()))
    .slice(0, limit);
}

export async function markEmergencyBackup(rowNumber, { status, syncedAt = '', attempts, error = '' }) {
  const values = [[status, syncedAt, String(attempts), error]];
  await google(`spreadsheets/${encodeURIComponent(process.env.GOOGLE_SHEETS_ID)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: [{ range: `'${SHEET_NAME}'!B${rowNumber}`, values: [[status]] }, { range: `'${SHEET_NAME}'!S${rowNumber}:U${rowNumber}`, values: [[syncedAt, String(attempts), error]] }] })
  });
}
