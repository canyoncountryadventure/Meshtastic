import { createSign } from 'node:crypto';

const SHEET_NAME='Telemetry Backup';
let accessToken,accessTokenExpiresAt=0;
const base64url=value=>Buffer.from(value).toString('base64url');
function account(){
 const value=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
 if(!value||!process.env.GOOGLE_SHEETS_ID)return null;
 try{return JSON.parse(value);}catch{throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');}
}
export function isGoogleSheetsBackupConfigured(){try{const a=account();return Boolean(a?.client_email&&a?.private_key);}catch{return false;}}
async function token(){
 if(accessToken&&Date.now()<accessTokenExpiresAt)return accessToken;
 const a=account();if(!a?.client_email||!a?.private_key)throw new Error('Google Sheets backup is not configured');
 const now=Math.floor(Date.now()/1000),header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
 const claim=base64url(JSON.stringify({iss:a.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
 const signer=createSign('RSA-SHA256');signer.update(`${header}.${claim}`);signer.end();
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${header}.${claim}.${signer.sign(a.private_key).toString('base64url')}`}),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error(`Google OAuth failed (${response.status})`);
 const body=await response.json();accessToken=body.access_token;accessTokenExpiresAt=Date.now()+Math.max(60,Number(body.expires_in||3600)-60)*1000;return accessToken;
}
async function google(path){
 const response=await fetch(`https://sheets.googleapis.com/v4/${path}`,{headers:{authorization:`Bearer ${await token()}`},signal:AbortSignal.timeout(10000)});
 const text=await response.text();if(!response.ok)throw new Error(`Google Sheets API failed (${response.status}): ${text.slice(0,300)}`);return text?JSON.parse(text):{};
}
const object=(value,fallback={})=>{try{const result=JSON.parse(value||'');return result&&typeof result==='object'&&!Array.isArray(result)?result:fallback;}catch{return fallback;}};
const number=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
function reading(row){
 const raw=object(row[17]),payload=object(row[16],raw.payload&&typeof raw.payload==='object'?raw.payload:{}),storedRadio=object(row[15]),nested=raw.radio&&typeof raw.radio==='object'?raw.radio:{};
 const nodeNum=number(raw.from??raw.node_num??row[3]);if(nodeNum===null)return null;
 return {id:row[0],packet_id:row[0],node_num:Math.trunc(nodeNum),station_name:row[4],observed_at:row[5],received_at:row[6]||null,telemetry_type:raw.type==='telemetry'?'environment':raw.type||'environment',temperature_c:number(payload.temperature_c??payload.temperature),metrics:payload,radio:{rssi:number(raw.rssi??nested.rssi??storedRadio.rssi),snr:number(raw.snr??nested.snr??storedRadio.snr),hop_start:number(raw.hop_start??nested.hop_start??storedRadio.hop_start),hop_limit:number(raw.hop_limit??nested.hop_limit??storedRadio.hop_limit),hops_away:number(raw.hops_away??raw.hops_used??nested.hops_away??nested.hops_used??storedRadio.hops_away),relay_node:raw.relay_node??nested.relay_node??storedRadio.relay_node??null,relay_id:raw.relay_id??nested.relay_id??null,relay_name:raw.relay_name??nested.relay_name??null,gateway:raw.gateway??raw.sender??raw.mesh_source??nested.gateway??storedRadio.gateway??null},backup_source:'google_sheets'};
}

// This is an outage-only read path.  It returns pending/retry rows and never
// represents them as database-backed observations.
export async function readEmergencyBackupData(hours,limit=5000){
 if(!isGoogleSheetsBackupConfigured())throw new Error('Google Sheets backup is not configured');
 const range=encodeURIComponent(`${SHEET_NAME}!A2:U${Math.max(2,Math.min(10000,Number(limit)+1))}`);
 const data=await google(`spreadsheets/${encodeURIComponent(process.env.GOOGLE_SHEETS_ID)}/values/${range}?majorDimension=ROWS`);
 const now=Date.now(),cutoff=now-Number(hours)*3600000,recentCutoff=now-24*3600000;
 const rows=(data.values||[]).map(row=>[...row,...Array(Math.max(0,21-row.length)).fill('')]).filter(row=>['pending','retry'].includes(String(row[1]).toLowerCase())).map(reading).filter(Boolean).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at));
 const latest=new Map();for(const item of rows){const key=`${item.node_num}:${item.telemetry_type}`;if(!latest.has(key))latest.set(key,item);}
 return {stations:[],readings:rows.filter(item=>new Date(item.observed_at).getTime()>=cutoff),latest:[...latest.values()],recent:rows.filter(item=>new Date(item.observed_at).getTime()>=recentCutoff),sensor_events:[],cc01_polling:null,sample_interval_hours:null};
}
