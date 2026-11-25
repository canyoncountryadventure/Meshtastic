// Unified System Administration owner session gates all private station telemetry.
// The upstream alert administrator verifies the HMAC; never trust client-side state.
export const PRIVATE_STATIONS=Object.freeze([647393146,2650172798,4241345683,1252758033,3044869407,3943979587]);
const ids=new Set(PRIVATE_STATIONS);
const BACKEND='https://meshtastic-ecru.vercel.app/api/watershed-alerts?auth_probe=1';
export const isPrivateStation=id=>ids.has(Number(id));
export function sessionCookie(req){
 const value=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('watershed_alerts_session='))||'';
 return /^watershed_alerts_session=\d{13}\.[a-f0-9]{64}$/.test(value)?value:'';
}
export async function hasPrivateAccess(req){
 const cookie=sessionCookie(req);
 if(!cookie)return false;
 try{
  const response=await fetch(BACKEND,{method:'GET',headers:{Cookie:cookie},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000)});
  if(!response.ok)return false;
  const data=await response.json();return data.ok===true&&data.authenticated===true;
 }catch{return false;}
}
export function hidePrivate(data,authorized){
 if(authorized)return data;
 const filter=items=>Array.isArray(items)?items.filter(item=>!isPrivateStation(item?.node_num)):items;
 return {...data,stations:filter(data.stations),readings:filter(data.readings),latest:filter(data.latest),recent:filter(data.recent)};
}
