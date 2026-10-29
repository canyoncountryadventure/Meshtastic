// Private stations remain in Neon and gateway ingestion, but are not public telemetry.
export const PRIVATE_STATION_IDS = Object.freeze([2740603892,647393146,2650172798]);
const privateNodes = new Set(PRIVATE_STATION_IDS);
export function isPrivateStation(id){return privateNodes.has(Number(id));}
export function publicOnly(items){return Array.isArray(items)?items.filter(item=>!isPrivateStation(item?.node_num)):items;}
export function filterPrivateTelemetry(data,authorized=false){
 if(authorized)return data;
 return {...data,stations:publicOnly(data.stations),readings:publicOnly(data.readings),
   latest:publicOnly(data.latest),recent:publicOnly(data.recent)};
}
