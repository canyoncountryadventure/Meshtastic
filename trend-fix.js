// CCA sandstone trend direction override.
// Lower ADC = wetter rock. Higher ADC = drier rock.
(function(){
  const WINDOW_MS=10*60*1000;
  const MIN_SPAN_MS=9*60*1000;
  const MIN_NET_CHANGE=4;

  window.rockTrend=function(rows){
    const valid=(rows||[])
      .map(r=>({t:new Date(r.observed_at).getTime(),adc:rockAdc(r)}))
      .filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.adc))
      .sort((a,b)=>a.t-b.t);
    if(valid.length<2)return null;

    const latestT=valid[valid.length-1].t;
    const pts=valid.filter(p=>p.t>=latestT-WINDOW_MS);
    if(pts.length<2)return null;

    const span=pts[pts.length-1].t-pts[0].t;
    if(span<MIN_SPAN_MS)return null;

    const start=pts[0].adc;
    const end=pts[pts.length-1].adc;
    const change=end-start;
    const minutes=span/60000;
    const slope=change/minutes;

    // ADC falling means capacitance/moisture is increasing: WETTING.
    if(change<=-MIN_NET_CHANGE){
      return{label:'WETTING',slope,change,start,end,minutes};
    }

    // ADC rising means the material is becoming drier: DRYING.
    if(change>=MIN_NET_CHANGE){
      return{label:'DRYING',slope,change,start,end,minutes};
    }

    return null;
  };

  // Remove the old fixed wording that could be mistaken for the live state.
  document.querySelectorAll('h2').forEach(el=>{
    if(el.textContent.trim()==='Drying-test summary')el.textContent='Wetness-test summary';
  });

  const footer=document.querySelector('footer span');
  if(footer&&footer.textContent.includes('Drying Experiment')){
    footer.textContent=footer.textContent.replace('Drying Experiment','Wetness Experiment');
  }

  // Re-render immediately with the corrected direction routine.
  if(typeof render==='function')setTimeout(render,0);
})();
