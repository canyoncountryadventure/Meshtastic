// CCA Navajo sandstone moisture-state bands.
// Lower ADC = wetter rock. Direction labels (WETTING/DRYING) are handled separately.
(function(){
  window.deriveBand=function(r){
    if(!r)return 'NO DATA';
    const adc=rockAdc(r);
    if(adc===null)return 'NO DATA';
    if(adc>=2300)return 'DRY';
    if(adc>=1850)return 'DAMP';
    if(adc>=1700)return 'WET';
    return 'SOAKED';
  };

  if(typeof render==='function')setTimeout(render,0);
})();
