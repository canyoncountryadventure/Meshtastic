import { validateRule as baseValidate, normalizeEmails, displayRule, storedRule } from './alert-values.js';
export { normalizeEmails, displayRule, storedRule };
export const STATIONS=[[1949224949,'Pack Creek'],[1695962694,'Cottonwood Creek'],[2425602407,'Cottonwood Relay'],[4241345683,'Mini Me'],[1222051909,'Cottonwood Relay 2'],[2004386937,'Matheson Groundwater'],[1683604927,'Mill Creek'],[3044869407,'Hidden Valley'],[1577197109,'Fishlake Hightop'],[2740603892,'Moab'],[647393146,'Seed Relay 1'],[2650172798,'Thousand Lake Mountain']];
export const PARAMETERS={discharge_cfs:'Discharge (cfs)',water_level_ft:'Stage (ft)',temperature_c:'Temperature (°F)',battery_percent:'Battery (%)',offline_hours:'Station unresponsive (hours)'};
export function validateRule(body){
 if(!STATIONS.some(([id])=>id===Number(body.node_num)))throw new Error('Choose a watershed station');
 if(!Object.hasOwn(PARAMETERS,body.parameter))throw new Error('Choose a supported watershed parameter');
 if(body.parameter==='offline_hours'){
   const threshold=Number(body.threshold);
   if(!Number.isInteger(threshold)||threshold<1||threshold>168)throw new Error('Choose an offline duration from 1 to 168 whole hours');
   return {node_num:Number(body.node_num),station_name:STATIONS.find(([id])=>id===Number(body.node_num))[1],parameter:'offline_hours',direction:'above',threshold,reset_value:0,enabled:body.enabled===true};
 }
 if(Number(body.node_num)===1222051909&&!['battery_percent'].includes(body.parameter))throw new Error('Choose battery percentage for Cottonwood Relay 2');
 if([2425602407,4241345683,3044869407,1577197109,2740603892,647393146,2650172798].includes(Number(body.node_num))&&!['temperature_c','battery_percent'].includes(body.parameter))throw new Error('Choose temperature or battery percentage for this relay');
 if(Number(body.node_num)===2004386937&&!['water_level_ft','temperature_c','battery_percent'].includes(body.parameter))throw new Error('Choose water depth, groundwater temperature, or battery percentage for Matheson Groundwater');
 if(Number(body.node_num)===1683604927&&!['water_level_ft','temperature_c','battery_percent'].includes(body.parameter))throw new Error('Choose stage, temperature, or battery percentage for Mill Creek');
 return baseValidate(body);
}
