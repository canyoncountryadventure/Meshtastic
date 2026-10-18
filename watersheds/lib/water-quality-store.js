export async function readWaterQualityData(sql){
 const sites=await sql`SELECT site_id,site_code,drainage,site_name,sort_order FROM water_quality_sites WHERE active ORDER BY sort_order,site_name`;
 const samples=await sql`SELECT q.sample_id,q.site_id,s.site_code,s.drainage,s.site_name,q.sampled_at,q.e_coli_mpn_100ml,q.e_coli_qualifier,q.water_temperature_c,q.specific_conductivity_us_cm,q.ph,q.dissolved_oxygen_mg_l,q.collected_by,q.notes,q.source_provider,q.source_station_id,q.source_site_name,q.source_activity_ids,q.source_latitude,q.source_longitude,q.sample_depth_m FROM water_quality_samples q JOIN water_quality_sites s USING(site_id) WHERE s.active AND q.sampled_at>=NOW()-INTERVAL '5 years' ORDER BY q.sampled_at DESC LIMIT 5000`;
 return {sites,samples};
}
