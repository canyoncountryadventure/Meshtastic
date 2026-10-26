export async function evaluateOfflineRules(sql) {
 const rows=await sql`SELECT r.id,r.node_num,r.station_name,r.threshold,r.active,r.recipients,r.revision,
   COALESCE((SELECT MAX(o.received_at) FROM creek_observations o WHERE o.node_num=r.node_num),r.created_at) AS last_received
   FROM alert_rules r WHERE r.enabled AND r.parameter='offline_hours' AND jsonb_array_length(r.recipients)>0`;
 let outages=0;
 for(const rule of rows){
   const last=new Date(rule.last_received).getTime();
   if(!Number.isFinite(last))continue;
   const ageHours=Math.max(0,(Date.now()-last)/3600000);
   const offline=ageHours>=Number(rule.threshold);
   const subject='Southeastern Utah Watersheds: '+rule.station_name+' has not delivered telemetry for '+rule.threshold+' hours';
   const body=rule.station_name+' has not delivered telemetry for '+ageHours.toFixed(1)+' hours.\n'+
     'Alert threshold: '+rule.threshold+' hours.\nLast received packet: '+new Date(last).toISOString()+
     '\nThis email is sent once per outage and resets after new telemetry is received.\n'+
     'Dashboard: https://seutahwatersheds.vercel.app/watershed\n';
   const changed=await sql`WITH locked AS MATERIALIZED (
     SELECT id,active,recipients,revision FROM alert_rules WHERE id=${rule.id} AND enabled AND parameter='offline_hours'
       AND revision=${rule.revision} FOR UPDATE
   ), changed AS (
     UPDATE alert_rules r SET active=${offline},last_observed_at=${new Date(last).toISOString()}::timestamptz
     FROM locked l WHERE r.id=l.id AND r.active IS DISTINCT FROM ${offline}
     RETURNING r.id,r.active,r.recipients
   ) INSERT INTO alert_deliveries(rule_id,reading_id,recipient,subject,body)
     SELECT c.id,NULL,email,${subject},${body} FROM changed c JOIN locked l ON c.id=l.id
       CROSS JOIN LATERAL jsonb_array_elements_text(c.recipients) email
     WHERE c.active AND NOT l.active ON CONFLICT DO NOTHING RETURNING id`;
   outages+=changed.length?1:0;
 }
 return {checked:rows.length,newDeliveries:outages};
}
