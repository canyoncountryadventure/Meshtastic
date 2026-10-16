import { validateRule as baseValidate, normalizeEmails, displayRule, storedRule } from './alert-values.js';
export { normalizeEmails, displayRule, storedRule };
export const STATIONS=[[1949224949,'Pack Creek'],[1695962694,'Cottonwood Creek'],[2425602407,'Cottonwood Relay']];
export const PARAMETERS={discharge_cfs:'Discharge (cfs)',water_level_ft:'Stage (ft)',temperature_c:'Temperature (°F)'};
export function validateRule(body){
 if(!STATIONS.some(([id])=>id===Number(body.node_num)))throw new Error('Choose a watershed station');
 if(!Object.hasOwn(PARAMETERS,body.parameter))throw new Error('Choose a supported watershed parameter');
 if(Number(body.node_num)===2425602407&&body.parameter!=='temperature_c')throw new Error('Choose air temperature for Cottonwood Relay');
 return baseValidate(body);
}
