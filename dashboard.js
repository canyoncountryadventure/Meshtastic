const HVRP_NODE_NUM = 1436900584;
const EXPECTED_TEMP_INTERVAL_HOURS = 1;
const STALE_AFTER_HOURS = 3.25;
const SITE = { lat: 38.53880, lon: -109.5409, elevationFt: 5800 };
const state = { hours: 24, readings: [], map: null, baseLayer: null, coverageLayer: null, coverageVisible: false, expandedMap: null };

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
  recent: $('recent'), updated: $('updated'), mapTopoBtn: $('mapTopoBtn'), mapSatBtn: $('mapSatBtn'),
  coverageBtn: $('coverageBtn'), coverageLegend: $('coverageLegend'), expandDialog: $('expandDialog'),
  expandTitle: $('expandTitle'), expandClose: $('expandClose'), expandedChart: $('expandedChart'), expandedMap: $('expandedMap')
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
const batteryTime = r => metric(r, 'device_observed_at') || r?.observed_at;
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

function rfClassFromRssi(v) {
  if (!Number.isFinite(v)) return '';
  if (v >= -110) return 'rf-strong';
  if (v >= -122) return 'rf-fair';
  return 'rf-weak';
}
function rfClassFromSnr(v) {
  if (!Number.isFinite(v)) return '';
  if (v >= -7) return 'rf-strong';
  if (v >= -15) return 'rf-fair';
  return 'rf-weak';
}
function setRfClass(el, cls) {
  if (!el) return;
  el.classList.remove('rf-strong', 'rf-fair', 'rf-weak');
  if (cls) el.classList.add(cls);
}

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
  for (let i = 1; i < asc.length; i++) gapH = Math.max(gapH, (new Date(asc[i].observed_at) - new Date(asc[i - 1].observed_at)) / 3600000);
  return { pct, expected, actual, gapH: asc.length > 1 ? gapH : null };
}

function trendForHours(rs, hours) {
  if (rs.length < 2) return null;
  const cutoff = Date.now() - hours * 3600000;
  const recent = rs.filter(r => new Date(r.observed_at).getTime() >= cutoff).sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));
  if (recent.length < 2) return null;
  const first = recent[0], last = recent[recent.length - 1];
  const dt = (new Date(last.observed_at) - new Date(first.observed_at)) / 3600000;
  if (dt <= 0) return null;
  const delta = tempF(last) - tempF(first);
  return { delta, perHour: delta / dt, hours: dt, count: recent.length };
}

function solarEstimate(rs) {
  const asc = [...rs].filter(r => batteryV(r) !== null).sort((a, b) => new Date(batteryTime(a)) - new Date(batteryTime(b)));
  if (asc.length < 2) return { hours: null, rises: 0 };
  let hours = 0, rises = 0;
  for (let i = 1; i < asc.length; i++) {
    const prev = asc[i - 1], cur = asc[i];
    const dt = (new Date(batteryTime(cur)) - new Date(batteryTime(prev))) / 3600000;
    const dv = batteryV(cur) - batteryV(prev);
    if (dt > 0 && dt <= 3 && dv >= 0.002) { hours += dt; rises += 1; }
  }
  return { hours, rises };
}

function renderSummary() {
  const tr = tempRows();
  const dr = deviceRows();
  const latestT = tr[0] || null;
  const latestD = [...dr].sort((a, b) => new Date(batteryTime(b)) - new Date(batteryTime(a)))[0] || null;
  const latestAny = rows()[0] || latestT || latestD;

  if (latestT) {
    const f = tempF(latestT);
    els.temperature.textContent = f.toFixed(1);
    els.tempDetail.textContent = `Automatic temperature reading received ${ageText(latestT.observed_at)} ago.`;
    els.lastPacket.textContent = ageText(latestT.observed_at);
    els.packetTime.textContent = fmtTime(latestT.observed_at);
    const online = ageHours(latestT.observed_at) <= STALE_AFTER_HOURS;
    els.status.className = `live-pill ${online ? 'online' : 'offline'}`;
    els.statusText.textContent = online ? 'Hidden Valley telemetry live' : `Last temperature packet ${ageText(latestT.observed_at)} ago`;
  } else {
    els.temperature.textContent = '—';
    els.tempDetail.textContent = 'Waiting for automatic temperature telemetry.';
    els.lastPacket.textContent = '—';
    els.packetTime.textContent = 'no telemetry yet';
    els.status.className = 'live-pill offline';
    els.statusText.textContent = 'Waiting for temperature telemetry';
  }

  const linkSource = latestT || latestAny;
  if (linkSource && (rssi(linkSource) !== null || snr(linkSource) !== null)) {
    const rv = rssi(linkSource), sv = snr(linkSource), hv = hops(linkSource);
    els.linkNow.textContent = rv === null ? '—' : `${Math.round(rv)} dBm`;
    setRfClass(els.linkNow, rfClassFromRssi(rv));
    const routeText = hv === 0 ? 'direct' : hv === 1 ? '1 relay' : hv !== null ? `${Math.round(hv)} relays` : 'route unknown';
    els.linkDetail.textContent = `SNR ${sv === null ? '—' : sv.toFixed(1) + ' dB'} · ${routeText}`;
  } else {
    els.linkNow.textContent = '—'; setRfClass(els.linkNow, ''); els.linkDetail.textContent = 'RSSI / SNR / route';
  }

  if (latestD) {
    const v = batteryV(latestD), p = batteryPct(latestD), bt = batteryTime(latestD);
    els.battery.textContent = p !== null ? `${Math.round(p)}%` : v !== null ? `${v.toFixed(3)} V` : '—';
    els.batteryDetail.textContent = [v !== null ? `${v.toFixed(3)} V` : null, bt ? `updated ${ageText(bt)} ago` : null].filter(Boolean).join(' · ');
  } else {
    els.battery.textContent = '—'; els.batteryDetail.textContent = 'battery telemetry pending';
  }

  const now = Date.now();
  const last24 = tr.filter(r => now - new Date(r.observed_at).getTime() <= 24 * 3600000);
  const temps24 = last24.map(tempF).filter(Number.isFinite);
  els.high24.textContent = temps24.length ? `${Math.max(...temps24).toFixed(1)}°` : '—';
  els.low24.textContent = temps24.length ? `${Math.min(...temps24).toFixed(1)}°` : '—';
  const avg = mean(temps24); els.avg24.textContent = avg === null ? '—' : `${avg.toFixed(1)}°`;

  const trend = trendForHours(tr, 12);
  if (trend) {
    els.tempTrend.textContent = `${trend.delta > 0 ? '+' : ''}${trend.delta.toFixed(1)}°`;
    els.tempTrendDetail.textContent = `${trend.perHour >= 0 ? '+' : ''}${trend.perHour.toFixed(2)}°/hr across ${trend.hours.toFixed(1)} hr`;
  } else { els.tempTrend.textContent = '—'; els.tempTrendDetail.textContent = 'need at least 2 readings in 12 hours'; }

  const rel = reliabilityStats(tr);
  els.reliability.textContent = rel.pct === null ? '—' : `${rel.pct.toFixed(0)}%`;
  els.reliabilityDetail.textContent = rel.actual ? `${rel.actual}/${rel.expected} expected temperature packets` : 'expected 1 temperature packet/hour';
  els.longestGap.textContent = rel.gapH === null ? '—' : `${rel.gapH.toFixed(1)} hr`;

  const hv = tr.map(hops).filter(Number.isFinite), hs = mean(hv), directCount = hv.filter(v => v === 0).length, relayedCount = hv.filter(v => v > 0).length;
  if (hs === null) { els.avgHops.textContent = '—'; els.hopDetail.textContent = '0 = direct, 1 = one relay'; }
  else {
    els.avgHops.textContent = relayedCount === 0 ? 'Direct' : directCount >= relayedCount ? 'Mostly direct' : `${hs.toFixed(1)} avg`;
    els.hopDetail.textContent = `${hs.toFixed(1)} average · ${directCount} direct · ${relayedCount} relayed`;
  }

  const sv = tr.map(snr).filter(Number.isFinite), sa = mean(sv);
  els.avgSnr.textContent = sa === null ? '—' : `${sa.toFixed(1)} dB`; setRfClass(els.avgSnr, rfClassFromSnr(sa));
  els.snrDetail.textContent = sv.length ? `best ${Math.max(...sv).toFixed(1)} · worst ${Math.min(...sv).toFixed(1)} dB` : 'selected window';

  const rv = tr.map(rssi).filter(Number.isFinite), best = rv.length ? Math.max(...rv) : null;
  els.bestRssi.textContent = best === null ? '—' : `${best.toFixed(0)} dBm`; setRfClass(els.bestRssi, rfClassFromRssi(best));
  els.packetCount.textContent = tr.length ? String(tr.length) : '0';
  els.packetCountDetail.textContent = `within selected ${state.hours >= 24 ? state.hours / 24 + ' day' + (state.hours === 24 ? '' : 's') : state.hours + 'h'} window`;

  const solar = solarEstimate(dr);
  if (solar.hours === null) { els.solarHours.textContent = '—'; els.solarDetail.textContent = 'need at least 2 battery readings'; }
  else if (solar.rises === 0) { els.solarHours.textContent = '0.0 hr'; els.solarDetail.textContent = 'no clear voltage-rise interval detected yet'; }
  else { els.solarHours.textContent = `${solar.hours.toFixed(1)} hr`; els.solarDetail.textContent = `${solar.rises} rising-voltage interval${solar.rises === 1 ? '' : 's'} detected`; }

  const dvRows = [...dr].filter(r => batteryV(r) !== null).sort((a, b) => new Date(batteryTime(a)) - new Date(batteryTime(b)));
  if (dvRows.length >= 2) {
    const firstV = batteryV(dvRows[0]), lastV = batteryV(dvRows[dvRows.length - 1]), change = lastV - firstV;
    els.batteryChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(3)} V`;
    els.batteryChangeDetail.textContent = `${firstV.toFixed(3)} → ${lastV.toFixed(3)} V · ${dvRows.length} samples`;
  } else if (dvRows.length === 1) { els.batteryChange.textContent = '0.000 V'; els.batteryChangeDetail.textContent = 'only one battery sample in selected window'; }
  else { els.batteryChange.textContent = '—'; els.batteryChangeDetail.textContent = 'no battery data in selected window'; }
}

function tooltipMarkup(title, lines) { return `<strong>${esc(title)}</strong>${lines.filter(Boolean).map(line => `<div>${esc(line)}</div>`).join('')}`; }
function attachChartTooltip(target) {
  if (!target) return;
  let tip = target.querySelector('.chart-tooltip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tooltip'; tip.hidden = true; target.appendChild(tip); }
  const show = (point, ev) => {
    tip.innerHTML = point.dataset.tip || ''; tip.hidden = false;
    const rect = target.getBoundingClientRect(), clientX = ev?.clientX ?? rect.left + rect.width / 2, clientY = ev?.clientY ?? rect.top + rect.height / 2;
    tip.style.left = `${Math.max(0, Math.min(rect.width - 180, clientX - rect.left))}px`; tip.style.top = `${Math.max(70, clientY - rect.top)}px`;
  };
  target.querySelectorAll('[data-tip]').forEach(point => {
    point.addEventListener('mouseenter', ev => show(point, ev)); point.addEventListener('mousemove', ev => show(point, ev));
    point.addEventListener('focus', ev => show(point, ev)); point.addEventListener('click', ev => { ev.stopPropagation(); show(point, ev); });
    point.addEventListener('mouseleave', () => { if (!point.matches(':focus')) tip.hidden = true; }); point.addEventListener('blur', () => { tip.hidden = true; });
  });
  target.addEventListener('click', ev => { if (!ev.target.closest('[data-tip]')) tip.hidden = true; });
}

function drawLineChart(target, inputRows, valueFn, opts = {}) {
  const pts = inputRows.map(r => ({ t: new Date(opts.timeFn ? opts.timeFn(r) : r.observed_at).getTime(), v: valueFn(r), r })).filter(p => Number.isFinite(p.t) && Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
  if (!pts.length) { target.innerHTML = `<div class="empty">${esc(opts.empty || 'Waiting for telemetry.')}</div>`; return; }
  if (pts.length === 1) { target.innerHTML = `<div class="single-reading"><strong>${esc(opts.format ? opts.format(pts[0].v) : pts[0].v)}</strong><span>${esc(fmtTime(new Date(pts[0].t).toISOString()))}</span></div>`; return; }
  const W = 980, H = opts.large ? 360 : 300, L = 64, R = 24, T = 24, B = 44;
  const minT = Math.min(...pts.map(p => p.t)), maxT = Math.max(...pts.map(p => p.t)), spanT = Math.max(1, maxT - minT);
  let minV = opts.min ?? Math.min(...pts.map(p => p.v)), maxV = opts.max ?? Math.max(...pts.map(p => p.v));
  if (maxV - minV < (opts.minSpan || 1)) { const mid = (maxV + minV) / 2, half = (opts.minSpan || 1) / 2; minV = mid - half; maxV = mid + half; }
  if (opts.min === undefined || opts.max === undefined) { const pad = (maxV - minV) * 0.12; minV -= pad; maxV += pad; }
  const x = t => L + ((t - minT) / spanT) * (W - L - R), y = v => T + (1 - (v - minV) / Math.max(0.0001, maxV - minV)) * (H - T - B);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const grid = Array.from({ length: 5 }, (_, i) => minV + (maxV - minV) * i / 4).map(v => `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" class="gridline"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" class="axis-label">${esc(opts.axisFormat ? opts.axisFormat(v) : v.toFixed(1))}</text>`).join('');
  const dots = pts.map(p => {
    const tip = tooltipMarkup(fmtTime(new Date(p.t).toISOString()), [opts.format ? opts.format(p.v) : String(p.v), opts.extraTip ? opts.extraTip(p.r) : null]);
    const cls = opts.dotClassFn ? opts.dotClassFn(p.r, p.v) : (opts.dotClass || 'temp');
    return `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="4.2" class="chart-dot ${esc(cls)}" tabindex="0" data-tip="${esc(tip)}"/>`;
  }).join('');
  target.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'chart')}">${grid}<path d="${path}" class="chart-line ${esc(opts.lineClass || '')}"/>${dots}<text x="${L}" y="${H - 12}" class="axis-label">${esc(fmtAxisTime(minT, spanT))}</text><text x="${W - R}" y="${H - 12}" text-anchor="end" class="axis-label">${esc(fmtAxisTime(maxT, spanT))}</text></svg>`;
  attachChartTooltip(target);
}

function drawBatteryChart(target, inputRows) {
  const pts = inputRows.map(r => ({ t: new Date(batteryTime(r)).getTime(), v: batteryV(r), p: batteryPct(r), r })).filter(p => Number.isFinite(p.t) && Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
  if (!pts.length) { target.innerHTML = '<div class="empty">Waiting for battery telemetry.</div>'; return; }
  if (pts.length === 1) { const p = pts[0]; target.innerHTML = `<div class="single-reading"><strong>${p.v.toFixed(3)} V</strong><span>${p.p === null ? '' : Math.round(p.p) + '% · '}${esc(fmtTime(new Date(p.t).toISOString()))}</span></div>`; return; }
  const W = 980, H = 300, L = 68, R = 24, T = 24, B = 44, minT = pts[0].t, maxT = pts[pts.length - 1].t, spanT = Math.max(1, maxT - minT);
  let minV = Math.min(...pts.map(p => p.v)), maxV = Math.max(...pts.map(p => p.v));
  if (maxV - minV < 0.03) { const mid = (maxV + minV) / 2; minV = mid - 0.015; maxV = mid + 0.015; } else { const pad = (maxV - minV) * 0.15; minV -= pad; maxV += pad; }
  const x = t => L + ((t - minT) / spanT) * (W - L - R), y = v => T + (1 - (v - minV) / (maxV - minV)) * (H - T - B);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const grid = Array.from({ length: 5 }, (_, i) => minV + (maxV - minV) * i / 4).map(v => `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" class="gridline"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" class="axis-label">${v.toFixed(3)}V</text>`).join('');
  const dots = pts.map((p, i) => {
    const charging = i > 0 && p.v - pts[i - 1].v >= 0.002;
    const tip = tooltipMarkup(fmtTime(new Date(p.t).toISOString()), [`${p.v.toFixed(3)} V`, p.p === null ? null : `${Math.round(p.p)}% battery`, charging ? `Voltage rose ${(p.v - pts[i - 1].v).toFixed(3)} V · possible charging` : null]);
    return `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="${charging ? 5 : 4.2}" class="chart-dot ${charging ? 'charge' : 'battery'}" tabindex="0" data-tip="${esc(tip)}"/>`;
  }).join('');
  target.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Battery voltage and possible solar charging">${grid}<path d="${path}" class="chart-line secondary"/>${dots}<text x="${L}" y="${H - 12}" class="axis-label">${esc(fmtAxisTime(minT, spanT))}</text><text x="${W - R}" y="${H - 12}" text-anchor="end" class="axis-label">${esc(fmtAxisTime(maxT, spanT))}</text><text x="${L}" y="16" class="legend-label">Voltage · amber points = possible charging</text></svg>`;
  attachChartTooltip(target);
}

function drawLinkChart(target, inputRows) {
  const pts = inputRows.map(r => ({ t: new Date(r.observed_at).getTime(), r: rssi(r), s: snr(r), row: r })).filter(p => Number.isFinite(p.t) && (Number.isFinite(p.r) || Number.isFinite(p.s))).sort((a, b) => a.t - b.t);
  if (!pts.length) { target.innerHTML = '<div class="empty">Waiting for RSSI/SNR metadata.</div>'; return; }
  if (pts.length === 1) { target.innerHTML = `<div class="single-reading"><strong>${pts[0].r ?? '—'} dBm</strong><span>SNR ${pts[0].s ?? '—'} dB</span></div>`; return; }
  const W = 980, H = 300, L = 66, R = 66, T = 24, B = 44, minT = pts[0].t, maxT = pts[pts.length - 1].t, spanT = Math.max(1, maxT - minT);
  const rVals = pts.map(p => p.r).filter(Number.isFinite), sVals = pts.map(p => p.s).filter(Number.isFinite);
  let rMin = Math.min(...rVals) - 4, rMax = Math.max(...rVals) + 4, sMin = Math.min(...sVals) - 2, sMax = Math.max(...sVals) + 2;
  if (rMax - rMin < 12) { const m = (rMax + rMin) / 2; rMin = m - 6; rMax = m + 6; }
  if (sMax - sMin < 8) { const m = (sMax + sMin) / 2; sMin = m - 4; sMax = m + 4; }
  const x = t => L + ((t - minT) / spanT) * (W - L - R), yr = v => T + (1 - (v - rMin) / (rMax - rMin)) * (H - T - B), ys = v => T + (1 - (v - sMin) / (sMax - sMin)) * (H - T - B);
  const rPath = pts.filter(p => Number.isFinite(p.r)).map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(1)} ${yr(p.r).toFixed(1)}`).join(' '), sPath = pts.filter(p => Number.isFinite(p.s)).map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(1)} ${ys(p.s).toFixed(1)}`).join(' ');
  const leftTicks = Array.from({length:5},(_,i)=>rMin+(rMax-rMin)*i/4).map(v=>`<text x="${L-10}" y="${yr(v)+4}" text-anchor="end" class="axis-label">${Math.round(v)}</text><line x1="${L}" y1="${yr(v)}" x2="${W-R}" y2="${yr(v)}" class="gridline"/>`).join('');
  const rightTicks = Array.from({length:5},(_,i)=>sMin+(sMax-sMin)*i/4).map(v=>`<text x="${W-R+10}" y="${ys(v)+4}" class="axis-label">${v.toFixed(1)}</text>`).join('');
  const rDots = pts.filter(p => Number.isFinite(p.r)).map(p => {
    const tip = tooltipMarkup(fmtTime(new Date(p.t).toISOString()), [`${Math.round(p.r)} dBm RSSI`, Number.isFinite(p.s) ? `${p.s.toFixed(1)} dB SNR` : null, hops(p.row) === 0 ? 'Direct' : hops(p.row) === 1 ? '1 relay hop' : Number.isFinite(hops(p.row)) ? `${Math.round(hops(p.row))} relay hops` : null]);
    return `<circle cx="${x(p.t)}" cy="${yr(p.r)}" r="4.4" class="chart-dot ${rfClassFromRssi(p.r)}" tabindex="0" data-tip="${esc(tip)}"/>`;
  }).join('');
  target.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="LoRa link quality">${leftTicks}${rightTicks}<path d="${rPath}" class="chart-line"/><path d="${sPath}" class="chart-line secondary"/>${rDots}<text x="${L}" y="${H-12}" class="axis-label">${esc(fmtAxisTime(minT,spanT))}</text><text x="${W-R}" y="${H-12}" text-anchor="end" class="axis-label">${esc(fmtAxisTime(maxT,spanT))}</text><text x="${L}" y="16" class="legend-label">RSSI dBm</text><text x="${W-R}" y="16" text-anchor="end" class="legend-label snr-label">SNR dB</text></svg>`;
  attachChartTooltip(target);
}

function renderCharts() {
  const tr = tempRows(), dr = deviceRows();
  els.tempChartCount.textContent = `${tr.length} reading${tr.length === 1 ? '' : 's'} · hover/tap points for values`;
  drawLineChart(els.tempChart, tr, tempF, { large: true, minSpan: 4, label: 'Temperature', format: v => `${v.toFixed(1)} °F`, axisFormat: v => `${v.toFixed(0)}°`, empty: 'Waiting for temperature telemetry.', dotClass: 'temp', extraTip: r => rssi(r) === null ? null : `RF ${Math.round(rssi(r))} dBm · SNR ${snr(r) === null ? '—' : snr(r).toFixed(1)} dB` });

  const bv = dr.filter(r => batteryV(r) !== null);
  els.batteryChartCount.textContent = bv.length ? `${bv.length} battery reading${bv.length === 1 ? '' : 's'} · voltage + charge-rise markers` : 'No battery telemetry yet';
  drawBatteryChart(els.batteryChart, bv);

  const linkRows = tr.filter(r => rssi(r) !== null || snr(r) !== null);
  els.linkChartCount.textContent = `${linkRows.length} RF sample${linkRows.length === 1 ? '' : 's'} · RSSI + SNR`;
  drawLinkChart(els.linkChart, linkRows);

  const hopRows = tr.filter(r => hops(r) !== null);
  els.hopChartCount.textContent = `${hopRows.length} route sample${hopRows.length === 1 ? '' : 's'} · 0 direct / 1 one relay`;
  drawLineChart(els.hopChart, hopRows, hops, { min: 0, minSpan: 2, label: 'Mesh relay hops', format: v => v === 0 ? 'Direct · 0 hops' : `${Math.round(v)} relay hop${Math.round(v) === 1 ? '' : 's'}`, axisFormat: v => `${Math.max(0, Math.round(v))}`, empty: 'Waiting for hop metadata.', dotClass: 'hop', lineClass: 'hop-line', extraTip: r => rssi(r) === null ? null : `${Math.round(rssi(r))} dBm · ${snr(r) === null ? '—' : snr(r).toFixed(1)} dB SNR` });
}

function renderRecent() {
  const rs = rows().slice(0, 30);
  if (!rs.length) { els.recent.innerHTML = '<tr><td colspan="8">Waiting for telemetry.</td></tr>'; return; }
  els.recent.innerHTML = rs.map(r => {
    const f = tempF(r), p = batteryPct(r), v = batteryV(r), rr = rssi(r), ss = snr(r), hh = hops(r), rrCls = rfClassFromRssi(rr), ssCls = rfClassFromSnr(ss);
    const hopText = hh === null ? '—' : hh === 0 ? 'Direct' : hh === 1 ? '1 relay' : `${Math.round(hh)} relays`;
    return `<tr><td>${esc(fmtTime(r.observed_at))}</td><td><span class="type-pill">TEMPERATURE</span></td><td class="right">${f === null ? '—' : f.toFixed(1)}</td><td class="right">${p === null ? '—' : Math.round(p) + '%'}</td><td class="right">${v === null ? '—' : v.toFixed(3) + ' V'}</td><td class="right">${rr === null ? '—' : `<span class="rf-chip ${rrCls}">${Math.round(rr)} dBm</span>`}</td><td class="right">${ss === null ? '—' : `<span class="rf-chip ${ssCls}">${ss.toFixed(1)} dB</span>`}</td><td class="right">${esc(hopText)}</td></tr>`;
  }).join('');
}

function mapPopupHtml() {
  const latestT = tempRows()[0] || null, latestD = [...deviceRows()].sort((a, b) => new Date(batteryTime(b)) - new Date(batteryTime(a)))[0] || null;
  const parts = ['<strong>Hidden Valley Repeater</strong>', `${SITE.lat.toFixed(5)}, ${SITE.lon.toFixed(4)}`, `${SITE.elevationFt.toLocaleString()} ft elevation`];
  if (latestT) parts.push(`${tempF(latestT).toFixed(1)} °F · ${ageText(latestT.observed_at)} ago`);
  if (latestD) parts.push(`${batteryPct(latestD) === null ? '—' : Math.round(batteryPct(latestD)) + '%'} · ${batteryV(latestD) === null ? '—' : batteryV(latestD).toFixed(3) + ' V'}`);
  return parts.join('<br>');
}

function createBaseLayer(kind) {
  if (!window.L) return null;
  if (kind === 'sat') return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri and contributors' });
  return L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: 'Map data © OpenStreetMap contributors · tiles © OpenTopoMap' });
}
function addSiteMarker(map) { return L.marker([SITE.lat, SITE.lon]).addTo(map).bindPopup(mapPopupHtml()); }
function buildCoverageLayer(map) {
  const group = L.layerGroup();
  const rings = [
    { km: 5, color: '#66d49d', label: '5 km · nearby / strong-line-of-sight zone' },
    { km: 15, color: '#b9d86d', label: '15 km · good line-of-sight planning ring' },
    { km: 30, color: '#f0bd6f', label: '30 km · long line-of-sight planning ring' },
    { km: 60, color: '#ee8f8f', label: '60 km · edge / exceptional line-of-sight ring' }
  ];
  [...rings].reverse().forEach(ring => L.circle([SITE.lat, SITE.lon], { radius: ring.km * 1000, color: ring.color, weight: 2, fillColor: ring.color, fillOpacity: 0.06 }).bindTooltip(ring.label).addTo(group));
  group.addTo(map); return group;
}
function setBaseMap(kind, map = state.map) {
  if (!map) return;
  if (state.baseLayer && map === state.map) map.removeLayer(state.baseLayer);
  const layer = createBaseLayer(kind); if (layer) layer.addTo(map);
  if (map === state.map) { state.baseLayer = layer; els.mapTopoBtn?.classList.toggle('active', kind === 'topo'); els.mapSatBtn?.classList.toggle('active', kind === 'sat'); }
}
function initMap() {
  if (!window.L || !document.getElementById('siteMap') || state.map) return;
  state.map = L.map('siteMap', { zoomControl: true }).setView([SITE.lat, SITE.lon], 11); setBaseMap('topo'); addSiteMarker(state.map).openPopup();
  els.mapTopoBtn?.addEventListener('click', () => setBaseMap('topo'));
  els.mapSatBtn?.addEventListener('click', () => setBaseMap('sat'));
  els.coverageBtn?.addEventListener('click', () => {
    state.coverageVisible = !state.coverageVisible; els.coverageBtn.classList.toggle('active', state.coverageVisible); els.coverageLegend.hidden = !state.coverageVisible;
    if (state.coverageVisible) { state.coverageLayer = state.coverageLayer || buildCoverageLayer(state.map); state.coverageLayer.addTo(state.map); state.map.fitBounds(L.circle([SITE.lat, SITE.lon], { radius: 60000 }).getBounds(), { padding: [20, 20] }); }
    else if (state.coverageLayer) { state.map.removeLayer(state.coverageLayer); state.map.setView([SITE.lat, SITE.lon], 11); }
  });
}

function openExpandedChart(sourceId, title) {
  const source = document.getElementById(sourceId); if (!source || !els.expandDialog) return;
  els.expandTitle.textContent = title || 'Chart'; els.expandedMap.hidden = true; els.expandedChart.hidden = false;
  const svg = source.querySelector('svg'), fallback = source.querySelector('.single-reading,.empty');
  els.expandedChart.innerHTML = svg ? svg.outerHTML : fallback ? fallback.outerHTML : '<div class="empty">No chart data.</div>'; attachChartTooltip(els.expandedChart); els.expandDialog.showModal();
}
function openExpandedMap(title) {
  if (!window.L || !els.expandDialog) return;
  els.expandTitle.textContent = title || 'Repeater site'; els.expandedChart.hidden = true; els.expandedChart.innerHTML = ''; els.expandedMap.hidden = false; els.expandDialog.showModal();
  if (state.expandedMap) { state.expandedMap.remove(); state.expandedMap = null; }
  setTimeout(() => {
    state.expandedMap = L.map('expandedMap').setView([SITE.lat, SITE.lon], state.coverageVisible ? 8 : 11);
    createBaseLayer(els.mapSatBtn?.classList.contains('active') ? 'sat' : 'topo')?.addTo(state.expandedMap); addSiteMarker(state.expandedMap).openPopup(); if (state.coverageVisible) buildCoverageLayer(state.expandedMap); state.expandedMap.invalidateSize();
  }, 50);
}
function initExpandControls() {
  document.querySelectorAll('[data-expand]').forEach(btn => btn.addEventListener('click', () => openExpandedChart(btn.dataset.expand, btn.dataset.title)));
  document.querySelectorAll('[data-expand-map]').forEach(btn => btn.addEventListener('click', () => openExpandedMap(btn.dataset.title)));
  els.expandClose?.addEventListener('click', () => els.expandDialog?.close());
  els.expandDialog?.addEventListener('close', () => { els.expandedChart.innerHTML = ''; if (state.expandedMap) { state.expandedMap.remove(); state.expandedMap = null; } els.expandedMap.innerHTML = ''; els.expandedMap.hidden = true; els.expandedChart.hidden = false; });
}

function render() {
  renderSummary(); renderCharts(); renderRecent();
  if (state.map && window.L) state.map.eachLayer(layer => { if (layer instanceof L.Marker) layer.setPopupContent(mapPopupHtml()); });
  els.updated.textContent = `Refreshed ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
}

async function refresh() {
  try {
    const url = `/api/readings?hours=${state.hours}&limit=10000&bucket_minutes=0&node=${HVRP_NODE_NUM}&_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' }); if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json(); state.readings = Array.isArray(data.readings) ? data.readings : []; render();
  } catch (err) { els.status.className = 'live-pill offline'; els.statusText.textContent = 'Dashboard data unavailable'; els.tempDetail.textContent = `Could not load telemetry: ${err.message}`; }
}

els.tabs?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-hours]'); if (!btn) return;
  state.hours = Number(btn.dataset.hours) || 24; els.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn)); refresh();
});

initExpandControls(); initMap(); refresh(); setInterval(refresh, 60 * 1000);
