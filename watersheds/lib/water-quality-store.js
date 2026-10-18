export async function readWaterQualityData(sql){
 const sites=await sql`SELECT site_id,site_code,mlid,drainage,site_name,sort_order,latitude,longitude FROM water_quality_sites WHERE active ORDER BY sort_order,site_name`;
 const parameters=await sql`SELECT parameter_code,parameter_name,unit,category,decimals,sort_order FROM water_quality_parameters WHERE active ORDER BY sort_order`;
 const samples=await sql`SELECT r.record_id AS sample_id,r.site_id,s.site_code,s.mlid,s.drainage,s.site_name,r.sampled_at,r.trip_id,r.source_site_name,r.notes,r.measurements,r.source_document,r.source_row_number FROM water_quality_records r JOIN water_quality_sites s USING(site_id) WHERE s.active ORDER BY r.sampled_at DESC,r.record_id DESC LIMIT 10000`;
 return {sites,parameters,samples};
}
