-- Expand the water-quality program to the complete Southeast Utah workbook.
-- MLID is the authoritative station key, and display names are cleaned for the public site.
ALTER TABLE water_quality_sites ADD COLUMN IF NOT EXISTS mlid TEXT;
ALTER TABLE water_quality_sites ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE water_quality_sites ADD COLUMN IF NOT EXISTS longitude NUMERIC;
CREATE UNIQUE INDEX IF NOT EXISTS water_quality_sites_mlid_unique
  ON water_quality_sites(mlid) WHERE mlid IS NOT NULL;

CREATE TABLE IF NOT EXISTS water_quality_parameters (
  parameter_code TEXT PRIMARY KEY,
  parameter_name TEXT NOT NULL,
  unit TEXT,
  category TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 2,
  sort_order INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS water_quality_records (
  record_id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES water_quality_sites(site_id),
  sampled_at TIMESTAMPTZ NOT NULL,
  trip_id TEXT,
  source_site_name TEXT,
  notes TEXT,
  measurements JSONB NOT NULL DEFAULT '{}'::JSONB,
  source_document TEXT NOT NULL,
  source_row_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_document, source_row_number)
);
CREATE INDEX IF NOT EXISTS water_quality_records_site_time
  ON water_quality_records(site_id, sampled_at DESC);
CREATE INDEX IF NOT EXISTS water_quality_records_measurements
  ON water_quality_records USING GIN(measurements);

INSERT INTO water_quality_parameters(parameter_code,parameter_name,unit,category,decimals,sort_order) VALUES
  ('water_temperature_c','Water temperature','°C','Field',2,10),
  ('ph','pH','standard units','Field',3,20),
  ('dissolved_oxygen_mg_l','Dissolved oxygen','mg/L','Field',3,30),
  ('dissolved_oxygen_saturation_pct','Dissolved oxygen saturation','%','Field',1,40),
  ('specific_conductivity_us_cm','Specific conductivity','µS/cm','Field',1,50),
  ('total_dissolved_solids_mg_l','Total dissolved solids','mg/L','Field',1,60),
  ('e_coli_mpn_100ml','E. coli','MPN/100 mL','Bacteria',2,70),
  ('discharge_cfs','Discharge','cfs','Flow',2,80),
  ('coliform','Coliform',NULL,'Bacteria',2,90),
  ('nitrate','Nitrate',NULL,'Nutrients',3,100),
  ('nitrite','Nitrite',NULL,'Nutrients',3,110),
  ('total_phosphorus','Total phosphorus',NULL,'Nutrients',3,120),
  ('calcium','Calcium',NULL,'Major ions',3,130),
  ('magnesium','Magnesium',NULL,'Major ions',3,140),
  ('sodium','Sodium',NULL,'Major ions',3,150),
  ('potassium','Potassium',NULL,'Major ions',3,160),
  ('chloride','Chloride',NULL,'Major ions',3,170),
  ('sulfate','Sulfate',NULL,'Major ions',3,180),
  ('arsenic','Arsenic',NULL,'Metals',4,190),
  ('barium','Barium',NULL,'Metals',4,200),
  ('cadmium','Cadmium',NULL,'Metals',4,210),
  ('copper','Copper',NULL,'Metals',4,220),
  ('iron','Iron',NULL,'Metals',4,230),
  ('lead','Lead',NULL,'Metals',4,240),
  ('manganese','Manganese',NULL,'Metals',4,250),
  ('mercury','Mercury',NULL,'Metals',5,260),
  ('selenium','Selenium',NULL,'Metals',4,270),
  ('thallium','Thallium',NULL,'Metals',5,280),
  ('zinc','Zinc',NULL,'Metals',4,290),
  ('gross_alpha','Gross alpha',NULL,'Radiological',3,300),
  ('gross_beta','Gross beta',NULL,'Radiological',3,310),
  ('uranium_238','Uranium-238',NULL,'Radiological',3,320),
  ('radium_226','Radium-226',NULL,'Radiological',3,330)
ON CONFLICT(parameter_code) DO UPDATE SET
  parameter_name=EXCLUDED.parameter_name,unit=EXCLUDED.unit,category=EXCLUDED.category,
  decimals=EXCLUDED.decimals,sort_order=EXCLUDED.sort_order,active=TRUE;

INSERT INTO water_quality_sites(site_code,mlid,drainage,site_name,sort_order,latitude,longitude) VALUES
  ('CC-DIVERSION','4958088','Castle Creek','Castle Creek above town diversion',10,38.6498300000,-109.4148600000),
  ('CC-CASTLETON','4958070','Castle Creek','Castle Creek at Castleton',20,38.6066500000,-109.3231700000),
  ('CC-HWY-128','4958030','Castle Creek','Castle Creek at Highway 128',30,38.6774800000,-109.4492900000),
  ('CC-USFS','4958075','Castle Creek','Castle Creek at USFS boundary',40,38.5905400000,-109.2601200000),
  ('CC-HEADWATERS-TRIB','4958073','Castle Creek','Castle Creek headwaters tributary',50,38.5956300000,-109.2895400000),
  ('CR-HWY-191','4957000','Colorado River','Colorado River at Highway 191',60,38.6038700000,-109.5748400000),
  ('CR-TAKEOUT-BEACH','4957997','Colorado River','Colorado River at Takeout Beach',70,38.6617800000,-109.5007400000),
  ('MLID-4953150','4953150','Comb Wash','Comb Wash at Highway 163',80,37.2658300000,-109.6759500000),
  ('MLID-4953210','4953210','Comb Wash','Comb Wash below Fish Creek',90,37.3841600000,-109.6684600000),
  ('MLID-4953173','4953173','Comb Wash','Fish Creek 1 mile above canyon mouth',100,37.3887500000,-109.6896300000),
  ('MLID-4953390','4953390','Cottonwood Creek','Cottonwood Creek above King Edward Mine',110,37.7749900000,-109.7014200000),
  ('MLID-4953350','4953350','Cottonwood Creek','Cottonwood Creek at Allen Canyon',120,37.6841600000,-109.6481800000),
  ('MLID-4953300','4953300','Cottonwood Creek','Cottonwood Creek at Highway 163',130,37.2825000000,-109.5606700000),
  ('CWC-HWY-95','4953320','Cottonwood Creek','Cottonwood Creek at Highway 95',140,37.5658300000,-109.5840500000),
  ('MLID-4953368','4953368','Cottonwood Creek','Cottonwood Creek below King Edward Mine',150,37.7700400000,-109.7013000000),
  ('NCWC-BEEF-BASIN','4955810','Cottonwood Creek','North Cottonwood Creek at Beef Basin Road',160,38.0283200000,-109.5898500000),
  ('MLID-4955775','4955775','Indian Creek','Indian Creek above Donnelly Canyon',170,38.0354300000,-109.5484500000),
  ('KENS-LAKE','5958508','Ken’s Lake','Ken’s Lake — South Beach',180,38.4795100000,-109.4282000000),
  ('MLID-4953060','4953060','Lime Creek','Lime Creek at Valley of the Gods Road',190,37.2358300000,-109.8142900000),
  ('MLID-4953880','4953880','McElmo Creek','McElmo Creek at Highway 262',200,37.2180500000,-109.1901100000),
  ('MLID-4956500','4956500','Mill Creek','Mill Creek above Sheley Tunnel',210,38.4819400000,-109.4050000000),
  ('MC-500-W','4956360','Mill Creek','Mill Creek at 500 West',220,38.5722000000,-109.5609500000),
  ('MC-HWY-191','4956390','Mill Creek','Mill Creek at Highway 191',230,38.5712300000,-109.5508100000),
  ('MLID-4956393','4956393','Mill Creek','Mill Creek at Mill Creek Drive',240,38.5636600000,-109.5334300000),
  ('MC-POWER-DAM','4956440','Mill Creek','Mill Creek at Power Dam',250,38.5621500000,-109.5144500000),
  ('MLID-4956425','4956425','Mill Creek','Mill Creek below 400 East',260,38.5657800000,-109.5430100000),
  ('MC-ROTARY-PARK','4956415','Mill Creek','Mill Creek below Rotary Park',270,38.5647200000,-109.5382400000),
  ('MLID-4953610','4953610','Montezuma Creek','Montezuma Creek below Verdure Creek',280,37.7781600000,-109.2671100000),
  ('MLID-4953611','4953611','Montezuma Creek','Montezuma Creek below Verdure Creek — replicate',290,37.7781600000,-109.2671100000),
  ('MLID-4953760','4953760','Montezuma Creek','Montezuma Creek below tailings pile',300,37.8639900000,-109.3329800000),
  ('MLID-4953635','4953635','Montezuma Creek','Verdure Creek 0.6 mile above Montezuma Creek',310,37.7782700000,-109.2865300000),
  ('MLID-4958280','4958280','Onion Creek','Onion Creek at Highway 128',320,38.7291500000,-109.3484500000),
  ('MLID-4958290','4958290','Onion Creek','Onion Creek below Stinking Springs',330,38.6983200000,-109.2753900000),
  ('MLID-4958300','4958300','Onion Creek','Onion Creek lower site',340,38.7177600000,-109.3328900000),
  ('MLID-4958310','4958310','Onion Creek','Onion Creek middle site',350,38.7027600000,-109.2917900000),
  ('MLID-4958320','4958320','Onion Creek','Onion Creek upper site',360,38.6983200000,-109.2578900000),
  ('PC-ABOVE-MC','4956455','Pack Creek','Pack Creek above Mill Creek',370,38.5702400000,-109.5540900000),
  ('MLID-4956510','4956510','Pack Creek','Pack Creek at Pack Creek Campground',380,38.5479900000,-109.5124500000),
  ('PC-SPANISH-TRAIL','4956530','Pack Creek','Pack Creek at Spanish Trail Drive',390,38.5342900000,-109.4935100000),
  ('MLID-4958240','4958240','Professor Creek','Professor Creek near Colorado River',400,38.7135200000,-109.3725000000),
  ('MLID-4953550','4953550','San Juan River','San Juan River above Montezuma Creek',410,37.2683300000,-109.3303900000),
  ('SJR-MEXICAN-HAT','4953000','San Juan River','San Juan River at Mexican Hat',420,37.1469500000,-109.8536700000),
  ('SJR-SAND-ISLAND','4953250','San Juan River','San Juan River at Sand Island',430,37.2602800000,-109.6137300000),
  ('MLID-4953400','4953400','San Juan River','San Juan River at Swinging Footbridge',440,37.2800000000,-109.4929000000),
  ('MLID-4953280','4953280','Westwater Creek','Westwater Creek at Highway 95',450,37.5761100000,-109.5070700000)
ON CONFLICT(site_code) DO UPDATE SET
  mlid=EXCLUDED.mlid,drainage=EXCLUDED.drainage,site_name=EXCLUDED.site_name,
  sort_order=EXCLUDED.sort_order,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,active=TRUE;
