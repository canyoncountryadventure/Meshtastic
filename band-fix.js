// CCA Navajo sandstone field-calibrated moisture scale — Aug 27, 2026.
// Lower ADC = wetter rock.
// Calibration anchors:
//   Dry baseline: ~2303 ADC = 0% Sandstone Wetness Index
//   Brief wetting / passing shower: ~2232 ADC
//   Surface wet / wet rock cluster: ~2032 to ~2009 ADC
//   Mostly soaked / prolonged penetration: ~1850 ADC
//   Extreme saturation upper limit: ~1484 ADC = 100%
(function(){
  const DRY_ADC=2303;
  const SATURATED_ADC=1484;

  window.calcWetness=function(r){
    if(!r)return null;
    const adc=rockAdc(r);
    if(adc===null)return null;
    return Math.max(0,Math.min(100,(DRY_ADC-adc)*100/(DRY_ADC-SATURATED_ADC)));
  };

  window.deriveBand=function(r){
    if(!r)return 'NO DATA';
    const adc=rockAdc(r);
    if(adc===null)return 'NO DATA';
    if(adc>=2268)return 'DRY';
    if(adc>=2126)return 'BRIEF WETTING';
    if(adc>=1935)return 'WET';
    if(adc>=1667)return 'MOSTLY SOAKED';
    return 'EXTREMELY SATURATED';
  };

  // Preserve the 10-minute WETTING/DRYING trend in the detail text,
  // but keep the main headline on the calibrated moisture state.
  const originalRenderSummary=window.renderSummary;
  if(typeof originalRenderSummary==='function'){
    window.renderSummary=function(){
      originalRenderSummary();
      const rows=rockRows();
      const rock=rows[0]||null;
      const band=window.deriveBand(rock);
      const stateEl=document.getElementById('rockState');
      if(stateEl){
        stateEl.textContent=band;
        stateEl.className=band==='DRY'?'good':band==='BRIEF WETTING'?'warn':['WET','MOSTLY SOAKED','EXTREMELY SATURATED'].includes(band)?'bad':'sand';
      }
      const wetnessDetail=document.getElementById('wetnessDetail');
      if(wetnessDetail)wetnessDetail.textContent='Sandstone Wetness Index: 0% dry → 100% extreme saturation; not volumetric water content';
      const baselineDetail=document.getElementById('baselineDetail');
      if(baselineDetail)baselineDetail.textContent='Aug 27 sandstone field calibration';
    };
  }

  if(typeof render==='function')setTimeout(render,0);
})();
