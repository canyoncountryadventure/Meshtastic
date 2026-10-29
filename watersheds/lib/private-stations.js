// Standalone site's private access is verified by the existing gateway owner password.
// Never cache private responses, log credentials, or trust a client-side visibility flag.
export const PRIVATE_STATIONS=Object.freeze([2740603892,647393146,2650172798]);
const ids=new Set(PRIVATE_STATIONS);
const BACKEND='https://meshtastic-ecru.vercel.app/api/watershed-alerts?ps=1';
export const isPrivateStation=id=>ids.has(Number(id));
export function sessionCookie(req){
 const value=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('ps_session='))||'';
 return /^ps_session=\d{13}\.[a-f0-9]{64}$/.test(value)?value:'';
}
export async function hasPrivateAccess(req){
 const cookie=sessionCookie(req);if(!cookie)return false;
 try{
  const r=await fetch(BACKEND,{method:'GET',headers:{Cookie:cookie},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6000)});
  if(!r.ok)return false;
  const result=await r.json();return result.authenticated===true;
 }catch{return false;} // Fail closed.
}
export function hidePrivate(data,authorized){
 if(authorized)return data;
 const filter=items=>Array.isArray(items)?items.filter(item=>!isPrivateStation(item?.node_num)):items;
 return {...data,stations:filter(data.stations),readings:filter(data.readings),
   latest:filter(data.latest),recent:filter(data.recent)};
}
