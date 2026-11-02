-- Mill Creek / Power Dam: two user-reported calibration observations, provisional linear discharge estimate.
-- Rating is h (ft) to Q (cfs) using a linear two-point fit (clamped Q>=0).
-- Derived zero-discharge intercept is not a measured zero stage; out-of-range readings extrapolated.
UPDATE public.creek_stations SET rating_curve=jsonb_build_object(
  'active',true,'provisional',true,'method','linear_two_point','calibration_points',2,
  'curve_version',1,'equation_type','power_offset',
  'coefficient_a',39.04761904761905,'stage_offset_ft',1.3463414634146342,'exponent_b',1,
  'valid_stage_min_ft',1.5,'valid_stage_max_ft',2.55,
  'source_notes','Provisional linear two-point rating based on user-reported observations: 1.50 ft = 6 cfs and 2.55 ft = 47 cfs. Offset is a derived intercept, not measured zero flow. Extrapolations are high uncertainty.'
)
WHERE node_num=1683604927 AND rating_curve IS NULL
AND (SELECT COUNT(*) FROM public.creek_rating_measurements WHERE node_num=1683604927
     AND ((stage_ft=1.50 AND discharge_cfs=6) OR (stage_ft=2.55 AND discharge_cfs=47)))=2;
