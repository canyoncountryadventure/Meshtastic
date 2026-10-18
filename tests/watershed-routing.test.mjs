import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

for (const folder of ['','watersheds/']) {
  const page = folder ? 'watersheds/index.html' : 'watershed.html';
  const script = folder + 'watershed.js';
  test('Stream Flow radio routes distinguish direct, relayed and unknown packets: ' + (folder || 'main'), async () => {
    const html = fs.readFileSync(new URL('../' + page, import.meta.url), 'utf8');
    assert.match(html, /id="routeRows"/);
    assert.match(html, /id="routeHopCount"/);
    const nodes = new Map();
    const buttons = ['flow','stage','temp','battery'].map(metric => ({dataset:{metric},setAttribute(){},addEventListener(event,fn){this[event]=fn;},hidden:false}));
    const element = id => {
      if(!nodes.has(id))nodes.set(id,{
        textContent:'',innerHTML:'',value:'',hidden:false,disabled:false,
        addEventListener(event,fn){this[event]=fn;},querySelectorAll(){return [];}
      });
      return nodes.get(id);
    };
    const time=new Date().toISOString();
    const readings=[
      {id:1,node_num:1949224949,telemetry_type:'water_distance',observed_at:time,metrics:{water_level_ft:2},discharge_cfs:12,radio:{hops_away:1,hop_start:3,hop_limit:2,relay_node:116,rssi:-85,snr:5.5,gateway:'Heltec Hub'}},
      {id:2,node_num:1695962694,telemetry_type:'mx2001',observed_at:time,metrics:{water_level_ft:1},temperature_c:12,radio:{hop_start:4,hop_limit:4,relay_node:70,rssi:-34,gateway:'Heltec Hub'}},
      {id:3,node_num:2425602407,telemetry_type:'environment',observed_at:time,metrics:{},temperature_c:10,radio:{}}
    ];
    vm.runInNewContext(fs.readFileSync(new URL('../'+script,import.meta.url),'utf8'),{
      document:{getElementById:element,querySelectorAll:q=>q==='[data-metric]'?buttons:[]},
      fetch:async()=>({ok:true,json:async()=>({ok:true,readings,latest:readings})}),
      Date,Number,String,Blob,URL,setTimeout
    });
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(element('routeHopCount').textContent,'1');
    assert.match(element('routeLastRelay').textContent,/Nuka-Cola.*ID suffix only/);
    assert.doesNotMatch(element('routeLastRelay').textContent,/Hidden Valley/);
    assert.equal(element('routeGateway').textContent,'Heltec Hub');
    assert.match(element('routeRows').innerHTML,/5.5 dB SNR/);
    element('stationSelect').change({target:{value:'1695962694'}});
    assert.equal(element('routeHopCount').textContent,'0');
    assert.equal(element('routeLastRelay').textContent,'Direct (no relay)');
    element('stationSelect').change({target:{value:'2425602407'}});
    assert.equal(element('routeHopCount').textContent,'—');
    assert.equal(element('routeLastRelay').textContent,'—');
    assert.match(element('routeSummary').textContent,/Route unknown/);
  });
}
