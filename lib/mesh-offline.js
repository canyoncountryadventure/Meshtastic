import { MESH_STATIONS } from './mesh-alert-values.js';

export function isStationDelayed(lastReceived,thresholdHours,now=Date.now()) {
  const time=new Date(lastReceived).getTime();
  return Number.isFinite(time) && Number.isInteger(Number(thresholdHours)) && Number(thresholdHours)>=1 &&
    Math.max(0,now-time)>=Number(thresholdHours)*3600000;
}

export async function evaluateMeshOfflineRules(sql,now=Date.now()) {
  // Read only neondb; these checks never select watershed stations.
  const rules=await sql`SELECT r.id,r.node_num,r.station_name,r.threshold,r.active,r.recipients,r.revision,
      COALESCE((SELECT MAX(t.received_at) FROM telemetry_readings t WHERE t.node_num=r.node_num
        AND (r.node_num<>3044869407 OR t.observed_at>='2026-10-05T00:00:00Z'::timestamptz)),
        r.created_at) AS last_received
      FROM alert_rules r WHERE r.enabled AND r.parameter='offline_hours'
        AND jsonb_array_length(r.recipients)>0
        AND r.node_num IN (3044869407,2740603892,1577197109,4241345683)`;
  let newDeliveries=0;
  for(const rule of rules.filter(r=>MESH_STATIONS.some(([id])=>id===Number(r.node_num)))) {
    const last=new Date(rule.last_received).getTime();
    if(!Number.isFinite(last))continue;
    const ageHours=Math.max(0,(now-last)/3600000);
    const delayed=isStationDelayed(rule.last_received,rule.threshold,now);
    const subject='Meshtastic: '+rule.station_name+' delayed · no telemetry for '+rule.threshold+' hours';
    const body=rule.station_name+' has not delivered a packet for '+ageHours.toFixed(1)+' hours.\n'+
      'Configured delay: '+rule.threshold+' hours.\nLast packet received: '+new Date(last).toISOString()+
      '\nThis sends once per outage, then rearms after a new station packet arrives.\n'+
      'Dashboard: https://meshtastic-ecru.vercel.app/\n';
    // The rule row lock prevents duplicate notifications from overlapping checks.
    const transition=await sql`WITH locked AS MATERIALIZED (
      SELECT id,active,recipients,revision FROM alert_rules
      WHERE id=${rule.id} AND enabled AND parameter='offline_hours'
        AND revision=${rule.revision} FOR UPDATE
    ), changed AS (
      UPDATE alert_rules r SET active=${delayed},last_observed_at=${new Date(last).toISOString()}::timestamptz
      FROM locked l WHERE r.id=l.id AND r.active IS DISTINCT FROM ${delayed}
      RETURNING r.id,r.active,r.recipients
    ) INSERT INTO alert_deliveries(rule_id,reading_id,recipient,subject,body)
      SELECT c.id,NULL,email,${subject},${body} FROM changed c JOIN locked l ON c.id=l.id
        CROSS JOIN LATERAL jsonb_array_elements_text(c.recipients) email
      WHERE c.active AND NOT l.active ON CONFLICT DO NOTHING RETURNING id`;
    newDeliveries+=transition.length;
    // Do not deliver an old outage notification after packets have resumed.
    if(!delayed)await sql`UPDATE alert_deliveries SET status='cancelled',error='Station resumed reporting'
      WHERE rule_id=${rule.id} AND reading_id IS NULL AND status='pending'
        AND subject LIKE 'Meshtastic:%delayed%'`;
  }
  return {checked:rules.length,newDeliveries};
}
