const HVRP_NODE_NUM = 1436900584;
const EXPECTED_TEMP_INTERVAL_HOURS = 1;
const STALE_AFTER_HOURS = 2.5;

const state = { hours: 24, readings: [] };
const $ = id => document.getElementById(id);
const els = {
  status: $('status'), statusText: $('statusText'), temperature: $('temperature'), tempDetail: $('tempDetail'),
  lastPacket: $('lastPacket'), packetTime: $('packetTime'), linkNow: $('linkNow'), linkDetail: $('linkDetail'),
  battery: $('battery'), batteryDetail: $('batteryDetail'), high24: $('high24'), low24: $('low24'), avg24: $('avg24'),
  tempTrend: $('tempTrend'), tempTrendDetail: $('tempTrendDetail'), reliability: $('reliability'), reliabilityDetail: $('reliabilityDetail'),
  longestGap: $('longestGap'), avgHops: $('avgHops'), hopDetail: $('hopDetail'), avgSnr: $('avgSnr'), snrDetail: $('snrDetail'),
  solarHours: $('solarHours'), solarDetail: $('solarDetail'), batteryChange: $('batteryChange'), batteryChangeDetail: $('batteryChangeDetail'),
  bestRssi: $('bestRssi'), packetCount: $('packetCount'), packetCountDetail: $('packetCountDetail'), tabs: $('tabs'),
  tempChart: $('tempChart'), tempChartCount: $('tempChartCount'), batteryChart: $('batteryChart'), batteryChartCount: $('batteryChartCount'),
  linkChart: $('linkChart'), linkChartCount: $('linkChartCount'), hopChart: $('hopChart'), hopChartCount: $('hopChartCount'),
  recent: $('recent'), updated: $('updated')
};

const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const metric = (r, ...keys) => {
  for (const k of keys) if (r?.metrics?.[k] !== undefined && r?.metrics?.[k] !== null) return r.metrics[k];
  return null;
};
const tempC = r => num(r?.temperature_c) ?? num(metric(r, 'temperature_c', 'temperature'));
const tempF = r => { const c = tempC(r); return c === null ? null : c * 9 / 5 + 32; };
const batteryV = r => num(metric(r, 'voltage', 'battery_voltage', 'battery_voltage_v'));
const batteryPct = r => num(metric(r, 'battery_level', 'battery_percent', 'battery_pct'));
const rssi = r => num(r?.radio?.rssi);
const snr = r => num(r?.radio?.snr);
const hops = r => num(r?.radio?.hops_away);
const ageMs = iso => Math.max(0, Date.now() - new Date(iso).getTime());
const ageHours = iso => ageMs(iso) / 3600000;
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function ageText(iso) {
  const s = ageMs(iso) / 1000;
  if (s < 60) return `${Math.round(s)} sec`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} hr`;
  return `${(s / 86400).toFixed(1)} d`;
}
function fmtTime(iso) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtAxisTime(ms, spanMs) {
  const d = new Date(ms);
  if (spanMs > 3 * 86400000) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function rows() { return state.readings.filter(r => num(r?.node_num) === HVRP_NODE_NUM); }
function tempRows() { return rows().filter(r => tempC(r) !== null && r.telemetry_type === 'environment'); }
function deviceRows() { return rows().filter(r => batteryV(r) !== null || batteryPct(r) !== null); }

function reliabilityStats(rs) {
  if (!rs.length) return { pct: null, expected: 0, actual: 0, gapH: null };
  const asc = [...rs].sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));
  const first = new Date(asc[0].observed_at).getTime();
  const last = new Date(asc[asc.length - 1].observed_at).getTime();
  const spanH = Math.max(0, (last - first) / 3600000);
  const expected = Math.max(1, Math.floor(spanH / EXPECTED_TEMP_INTERVAL_HOURS + 0.25) + 1);
  const actual = asc.length;
  const pct = Math.min(100, actual / expected * 100);
  let gapH = 0;
  for (let i = 1; i < asc.length; i++) {
    gapH = Math.max(gapH, (new Date(asc[i].observed_at) - new Date(asc[i - 1].observed_at)) / 3600000);
  }
  return { pct, expected, actual, gapH: asc.length > 1 ? gapH : null };
}

function tempTrend(rs) {
  if (rs.length < 2) return null;
  const recent = rs.slice(0, 6).reverse();
  const first = recent[0], last = recent[recent.length - 1];
  const dt = (new Date(last.observed_at) - new Date(first.observed_at)) / 3600000;
  if (dt <= 0) return null;
  const delta = tempF(last) - tempF(first);
  return { delta, perHour: delta / dt, hours: dt };
}

function solarEstimate(rs) {
  const asc = [...rs].filter(r => batteryV(r) !== null).sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));
  if (asc.length < 2) return { hours: null, rises: 0 };
  let hours = 0, rises = 0;
  for (let i = 1; i < asc.length; i++) {
    const prev = asc[i - 1], cur = asc[i];
    const dt = (new Date(cur.observed_at) - new Date(prev.observed_at)) / 3600000;
    const dv = batteryV(cur) - batteryV(prev);
    if (dt > 0 && dt <= 3 && dv >= 0.01) {
      hours += dt;
      rises += 1;
    }
  }
  return { hours, rises };
}

function renderSummary() {
  const tr = tempRows();
  const dr = deviceRows();
  const latestT = tr[0] || null;
  const latestD = dr[0] || null;
  const latestAny = rows()[0] || latestT || latestD;

  if (latestT) {
    const f = tempF(latestT);
    els.temperature.textContent = f.toFixed(1);
    els.tempDetail.textContent = `Automatic MX2201 reading received ${ageText(latestT.observed_at)} ago · hourly logger interval.`;
    els.lastPacket.textContent = ageText(latestT.observed_at);
    els.packetTime.textContent = fmtTime(latestT.observed_at);
    const online = ageHours(latestT.observed_at) <= STALE_AFTER_HOURS;
    els.status.className = `live-pill ${online ? 'online' : 'offline'}`;
    els.statusText.textContent = online ? 'Hidden Valley telemetry live' : `Last MX2201 packet ${ageText(latestT.observed_at)} ago`;
  } else {
    els.temperature.textContent = '—';
    els.tempDetail.textContent = 'Waiting for the first automatic hourly MX2201 packet after the database reset.';
    els.lastPacket.textContent = '—';
    els.packetTime.textContent = 'no telemetry yet';
    els.status.className = 'live-pill offline';
    els.statusText.textContent = 'Waiting for hourly MX2201 telemetry';
  }

  const linkSource = latestT || latestAny;
  if (linkSource && (rssi(linkSource) !== null || snr(linkSource) !== null)) {
    els.linkNow.textContent = rssi(linkSource) === null ? '—' : `${Math.round(rssi(linkSource))} dBm`;
    els.linkDetail.textContent = `SNR ${snr(linkSource) === null ? '—' : snr(linkSource).toFixed(1) + ' dB'} · ${hops(linkSource) ?? '—'} hop${hops(linkSource) === 1 ? '' : 's'}`;
  } else {
    els.linkNow.textContent = '—';
    els.linkDetail.textContent = 'RSSI / SNR / hops';
  }

  if (latestD) {
    const v = batteryV(latestD), p = batteryPct(latestD);
    els.battery.textContent = p !== null ? `${Math.round(p)}%` : v !== null ? `${v.toFixed(2)} V` : '—';
    els.batteryDetail.textContent = [v !== null ? `${v.toFixed(3)} V` : null, `updated ${ageText(latestD.observed_at)} ago`].filter(Boolean).join(' · ');
  } else {
    els.battery.textContent = '—';
    els.batteryDetail.textContent = 'device telemetry pending';
  }

  const now = Date.now();
  const last24 = tr.filter(r => now - new Date(r.observed_at).getTime() <= 24 * 3600000);
  const temps24 = last24.map(tempF).filter(Number.isFinite);
  els.high24.textContent = temps24.length ? `${Math.max(...temps24).toFixed(1)}°` : '—';
  els.low24.textContent = temps24.length ? `${Math.min(...temps24).toFixed(1)}°` : '—';
  const avg = mean(temps24);
  els.avg24.textContent = avg === null ? '—' : `${avg.toFixed(1)}°`;

  const trend = tempTrend(tr);
  if (trend) {
    const sign = trend.perHour > 0 ? '+' : '';
    els.tempTrend.textContent = `${sign}${trend.perHour.toFixed(2)}°/hr`;
    els.tempTrendDetail.textContent = `${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(1)}° over ${trend.hours.toFixed(1)} hr`;
  } else {
    els.tempTrend.textContent = '—';
    els.tempTrendDetail.textContent = 'need at least 2 hourly readings';
  }

  const rel = reliabilityStats(tr);
  els.reliability.textContent = rel.pct === null ? '—' : `${rel.pct.toFixed(0)}%`;
  els.reliabilityDetail.textContent = rel.actual ? `${rel.actual}/${rel.expected} expected packets across observed span` : 'expected 1 packet/hour';
  els.longestGap.textContent = rel.gapH === null ? '—' : `${rel.gapH.toFixed(1)} hr`;

  const hv = tr.map(hops).filter(Number.isFinite);
  const hs = mean(hv);
  els.avgHops.textContent = hs === null ? '—' : hs.toFixed(1);
  els.hopDetail.textContent = hv.length ? `${Math.min(...hv)}–${Math.max(...hv)} hops observed` : 'selected window';

  const sv = tr.map(snr).filter(Number.isFinite);
  const sa = mean(sv);
  els.avgSnr.textContent = sa === null ? '—' : `${sa.toFixed(1)} dB`;
  els.snrDetail.textContent = sv.length ? `best ${Math.max(...sv).toFixed(1)} · worst ${Math.min(...sv).toFixed(1)} dB` : 'selected window';

  const rv = tr.map(rssi).filter(Number.isFinite);
  els.bestRssi.textContent = rv.length ? `${Math.max(...rv).toFixed(0)} dBm` : '—';
  els.packetCount.textContent = tr.length ? String(tr.length) : '0';
  els.packetCountDetail.textContent = `within selected ${state.hours >= 24 ? state.hours / 24 + ' day' + (state.hours === 24 ? '' : 's') : state.hours + 'h'} window`;

  const solar = solarEstimate(dr);
  els.solarHours.textContent = solar.hours === null ? '—' : `${solar.hours.toFixed(1)} hr`;
  els.solarDetail.textContent = solar.hours === null ? 'waiting for battery history' : `${solar.rises} charging-rise interval${solar.rises === 1 ? '' : 's'} · estimated`;

  const dvRows = [...dr].filter(r => batteryV(r) !== null).sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));
  if (dvRows.length >= 2) {
    const change = batteryV(dvRows[dvRows.length - 1]) - batteryV(dvRows[0]);
    els.batteryChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(3)} V`;
    els.batteryChangeDetail.textContent = `${batteryV(dvRows[0]).toFixed(3)} → ${batteryV(dvRows[dvRows.length - 1]).toFixed(3)} V`;
  } else {
    els.batteryChange.textContent = '—';
    els.batteryChangeDetail.textContent = 'need at least 2 battery readings';
  }
}

function drawLineChart(target, inputRows, valueFn, opts = {}) {
  const pts = inputRows.map(r => ({ t: new Date(r.observed_at).getTime(), v: valueFn(r) })).filter(p => Number.isFinite(p.t) && Number.isFinite(p.v)).reverse();
  if (!pts.length) { target.innerHTML = `<div class="empty">${esc(opts.empty || 'Waiting for telemetry.')}</div>`; return; }
  if (pts.length === 1) { target.innerHTML = `<div class="single-reading"><strong>${opts.format ? opts.format(pts[0].v) : pts[0].v}</strong><span>One reading received · ${fmtTime(new Date(pts[0].t).toISOString())}</span></div>`; return; }
  const W = 980, H = opts.large ? 360 : 300, L = 64, R = 24, T = 24, B = 44;
  const minT = Math.min(...pts.map(p => p.t)), maxT = Math.max(...pts.map(p => p.t)), spanT = Math.max(1, maxT - minT);
  let minV = opts.min ?? Math.min(...pts.map(p => p.v));
  let maxV = opts.max ?? Math.max(...pts.map(p => p.v));
  if (maxV - minV < (opts.minSpan || 1)) { const mid = (maxV + minV) / 2; const half = (opts.minSpan || 1) / 2; minV = mid - half; maxV = mid + half; }
  if (opts.min === undefined || opts.max === undefined) { const pad = (maxV - minV) * 0.12; minV -= pad; maxV += pad; }
  const x = t => L + ((t - minT) / spanT) * (W - L - R);
  const y = v => T + (1 - (v - minV) / Math.max(0.0001, maxV - minV)) * (H - T - B);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const grid = Array.from({ length: 5 }, (_, i) => minV + (maxV - minV) * i / 4).map(v => `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" class="gridline"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" class="axis-label">${esc(opts.axisFormat ? opts.axisFormat(v) : v.toFixed(1))}</text>`).join('');
  const dots = pts.map(p => `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="3.5" class="chart-dot"><title>${fmtTime(new Date(p.t).toISOString())}: ${esc(opts.format ? opts.format(p.v) : p.v)}</title></circle>`).join('');
  target.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'chart')}">${grid}<path d="${path}" class="chart-line"/>${dots}<text x="${L}" y="${H - 12}" class="axis-label">${esc(fmtAxisTime(minT, spanT))}</text><text x="${W - R}" y="${H - 12}" text-anchor="end" class="axis-label">${esc(fmtAxisTime(maxT, spanT))}</text></svg>`;
}

function drawLinkChart(target, inputRows) {
  const pts = inputRows.map(r => ({ t: new Date(r.observed_at).getTime(), r: rssi(r), s: snr(r) })).filter(p => Number.isFinite(p.t) && (Number.isFinite(p.r) || Number.isFinite(p.s))).reverse();
  if (!pts.length) { target.innerHTML = '<div class="empty">Waiting for RSSI/SNR metadata.</div>'; return; }
  if (pts.length === 1) { target.innerHTML = `<div class="single-reading"><strong>${pts[0].r ?? '—'} dBm · ${pts[0].s ?? '—'} dB</strong><span>One RF sample received</span></div>`; return; }
  const W = 980, H = 300, L = 66, R = 66, T = 24, B = 44;
  const minT = Math.min(...pts.map(p => p.t)), maxT = Math.max(...pts.map(p => p.t)), spanT = Math.max(1, maxT - minT);
  const rVals = pts.map(p => p.r).filter(Number.isFinite), sVals = pts.map(p => p.s).filter(Number.isFinite);
  let rMin = Math.min(...rVals) - 4, rMax = Math.max(...rVals) + 4;
  let sMin = Math.min(...sVals) - 2, sMax = Math.max(...sVals) + 2;
  if (rMax - rMin < 12) { const m = (rMax + rMin) / 2; rMin = m - 6; rMax = m + 6; }
  if (sMax - sMin < 8) { const m = (sMax + sMin) / 2; sMin = m - 4; sMax = m + 4; }
  const x = t => L + ((t - minT) / spanT) * (W - L - R);
  const yr = v => T + (1 - (v - rMin) / (rMax - rMin)) * (H - T - B);
  const ys = v => T + (1 - (v - sMin) / (sMax - sMin)) * (H - T - B);
  const rPath = pts.filter(p => Number.isFinite(p.r)).map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(1)} ${yr(p.r).toFixed(1)}`).join(' ');
  const sPath = pts.filter(p => Number.isFinite(p.s)).map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(1)} ${ys(p.s).toFixed(1)}`).join(' ');
  const leftTicks = Array.from({length:5},(_,i)=>rMin+(rMax-rMin)*i/4).map(v=>`<text x="${L-10}" y="${yr(v)+4}" text-anchor="end" class="axis-label">${Math.round(v)}</text><line x1="${L}" y1="${yr(v)}" x2="${W-R}" y2="${yr(v)}" class="gridline"/>`).join('');
  const rightTicks = Array.from({length:5},(_,i)=>sMin+(sMax-sMin)*i/4).map(v=>`<text x="${W-R+10}" y="${ys(v)+4}" class="axis-label">${v.toFixed(1)}</text>`).join('');
  target.innerHTML = `<svg viewBox="0 0 ${W} ${H}">${leftTicks}${rightTicks}<path d="${rPath}" class="chart-line rssi-line"/><path d="${sPath}" class="chart-line snr-line"/><text x="${L}" y="${H-12}" class="axis-label">${esc(fmtAxisTime(minT,spanT))}</text><text x="${W-R}" y="${H-12}" text-anchor="end" class="axis-label">${esc(fmtAxisTime(maxT,spanT))}</text><text x="${L}" y="16" class="legend-label">RSSI dBm</text><text x="${W-R}" y="16" text-anchor="end" class="legend-label snr-label">SNR dB</text></svg>`;
}

function renderCharts() {
  const tr = tempRows(), dr = deviceRows();
  els.tempChartCount.textContent = `${tr.length} reading${tr.length === 1 ? '' : 's'} · hourly logger`;
  drawLineChart(els.tempChart, tr, tempF, { large: true, minSpan: 4, label: 'MX2201 temperature', format: v => `${v.toFixed(1)} °F`, axisFormat: v => `${v.toFixed(0)}°`, empty: 'Waiting for the first automatic MX2201 packet.' });

  const bv = dr.filter(r => batteryV(r) !== null);
  els.batteryChartCount.textContent = bv.length ? `${bv.length} battery reading${bv.length === 1 ? '' : 's'}` : 'No device telemetry yet';
  drawLineChart(els.batteryChart, bv, batteryV, { minSpan: 0.15, label: 'Battery voltage', format: v => `${v.toFixed(3)} V`, axisFormat: v => `${v.toFixed(2)}V`, empty: 'Battery graph will populate when Hidden Valley device telemetry reaches the gateway.' });

  const linkRows = tr.filter(r => rssi(r) !== null || snr(r) !== null);
  els.linkChartCount.textContent = `${linkRows.length} RF sample${linkRows.length === 1 ? '' : 's'} · RSSI + SNR`;
  drawLinkChart(els.linkChart, linkRows);

  const hopRows = tr.filter(r => hops(r) !== null);
  els.hopChartCount.textContent = `${hopRows.length} hop sample${hopRows.length === 1 ? '' : 's'}`;
  drawLineChart(els.hopChart, hopRows, hops, { min: 0, minSpan: 2, label: 'Mesh hops', format: v => `${v.toFixed(0)} hops`, axisFormat: v => `${Math.max(0, Math.round(v))}`, empty: 'Waiting for hop metadata.' });
}

function renderRecent() {
  const rs = rows().slice(0, 30);
  if (!rs.length) { els.recent.innerHTML = '<tr><td colspan="8">Waiting for telemetry.</td></tr>'; return; }
  els.recent.innerHTML = rs.map(r => {
    const f = tempF(r), p = batteryPct(r), v = batteryV(r), rr = rssi(r), ss = snr(r), hh = hops(r);
    return `<tr><td>${esc(fmtTime(r.observed_at))}</td><td><span class="type-pill ${r.telemetry_type === 'device' ? 'device' : 'temp'}">${r.telemetry_type === 'device' ? 'BATTERY' : 'MX2201'}</span></td><td class="right">${f === null ? '—' : f.toFixed(1)}</td><td class="right">${p === null ? '—' : Math.round(p) + '%'}</td><td class="right">${v === null ? '—' : v.toFixed(3) + ' V'}</td><td class="right">${rr === null ? '—' : Math.round(rr)}</td><td class="right">${ss === null ? '—' : ss.toFixed(1)}</td><td class="right">${hh === null ? '—' : Math.round(hh)}</td></tr>`;
  }).join('');
}

function render() {
  renderSummary();
  renderCharts();
  renderRecent();
  els.updated.textContent = `Refreshed ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
}

async function refresh() {
  try {
    const url = `/api/readings?hours=${state.hours}&limit=10000&bucket_minutes=0&node=${HVRP_NODE_NUM}&_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.readings = Array.isArray(data.readings) ? data.readings : [];
    render();
  } catch (err) {
    els.status.className = 'live-pill offline';
    els.statusText.textContent = 'Dashboard data unavailable';
    els.tempDetail.textContent = `Could not load telemetry: ${err.message}`;
  }
}

els.tabs?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-hours]');
  if (!btn) return;
  state.hours = Number(btn.dataset.hours) || 24;
  els.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
  refresh();
});

refresh();
setInterval(refresh, 60 * 1000);
