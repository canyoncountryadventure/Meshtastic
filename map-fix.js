// Hidden Valley map reliability patch.
// Keeps map concerns isolated from telemetry/chart rendering.
(function () {
  const SITE_COORDS = [38.53880, -109.5409];
  const SITE_ELEVATION_FT = 5800;

  const PROVIDERS = {
    topo: {
      primary: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
      fallback: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: 'USGS The National Map',
      fallbackAttribution: '© OpenStreetMap contributors',
      maxZoom: 20,
    },
    sat: {
      primary: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
      fallback: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'USGS The National Map imagery',
      fallbackAttribution: 'Imagery © Esri and contributors',
      maxZoom: 20,
    },
  };

  let activeKind = 'topo';
  let statusEl = null;
  let resizeObserver = null;

  function ensureStatus() {
    statusEl = document.getElementById('mapStatus');
    if (statusEl) return statusEl;
    const map = document.getElementById('siteMap');
    if (!map) return null;
    statusEl = document.createElement('div');
    statusEl.id = 'mapStatus';
    statusEl.className = 'chart-note';
    statusEl.style.paddingTop = '0';
    statusEl.style.minHeight = '18px';
    map.insertAdjacentElement('afterend', statusEl);
    return statusEl;
  }

  function setStatus(text, tone) {
    const el = ensureStatus();
    if (!el) return;
    el.textContent = text || '';
    el.style.color = tone === 'bad' ? '#ee8f8f' : tone === 'warn' ? '#f0bd6f' : '#92a6ac';
  }

  function loadCss(url) {
    return new Promise(resolve => {
      const existing = Array.from(document.styleSheets).some(s => (s.href || '').includes('leaflet'));
      if (existing) return resolve();
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function ensureLeaflet() {
    if (window.L) return true;
    setStatus('Loading map engine…');
    await loadCss('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css');
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js');
    } catch (_) {
      await loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
      try {
        await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
      } catch (_) {
        setStatus('Map engine could not load. Refresh the page or disable a content blocker for this site.', 'bad');
        return false;
      }
    }
    return !!window.L;
  }

  function providerLayer(kind, onReady) {
    const p = PROVIDERS[kind] || PROVIDERS.topo;
    let errorCount = 0;
    let switched = false;
    let layer = L.tileLayer(p.primary, {
      maxZoom: p.maxZoom,
      attribution: p.attribution,
      updateWhenIdle: true,
      keepBuffer: 3,
    });

    layer.on('loading', () => setStatus(`${kind === 'sat' ? 'Aerial imagery' : 'Topo'} loading…`));
    layer.on('load', () => {
      setStatus(`${kind === 'sat' ? 'Aerial imagery' : 'USGS topo'} loaded.`);
      if (typeof onReady === 'function') onReady(layer);
    });
    layer.on('tileerror', () => {
      errorCount += 1;
      if (switched || errorCount < 3) return;
      switched = true;
      const map = layer._map;
      if (!map) return;
      setStatus(`Primary ${kind === 'sat' ? 'imagery' : 'topo'} tiles failed; switching to backup map…`, 'warn');
      map.removeLayer(layer);
      const backup = L.tileLayer(p.fallback, {
        maxZoom: 19,
        attribution: p.fallbackAttribution,
        updateWhenIdle: true,
        keepBuffer: 3,
      });
      backup.on('load', () => setStatus(`Backup ${kind === 'sat' ? 'imagery' : 'map'} loaded.`));
      backup.on('tileerror', () => setStatus('Map tiles are being blocked or are temporarily unavailable.', 'bad'));
      backup.addTo(map);
      if (map === state.map) state.baseLayer = backup;
    });
    return layer;
  }

  function fixedCreateBaseLayer(kind) {
    return providerLayer(kind);
  }

  function fixedAddSiteMarker(map) {
    const marker = L.circleMarker(SITE_COORDS, {
      radius: 8,
      color: '#edf5f5',
      weight: 2,
      fillColor: '#6fd0bf',
      fillOpacity: 1,
    }).addTo(map);

    let popup = `<strong>Hidden Valley Repeater</strong><br>${SITE_COORDS[0].toFixed(5)}, ${SITE_COORDS[1].toFixed(4)}<br>${SITE_ELEVATION_FT.toLocaleString()} ft elevation`;
    try {
      if (typeof mapPopupHtml === 'function') popup = mapPopupHtml();
    } catch (_) {}
    marker.bindPopup(popup);
    return marker;
  }

  function fixedBuildCoverageLayer(map) {
    const group = L.layerGroup();
    const rings = [
      { km: 5, color: '#66d49d', label: '5 km · nearby planning zone' },
      { km: 15, color: '#b9d86d', label: '15 km · good line-of-sight planning zone' },
      { km: 30, color: '#f0bd6f', label: '30 km · long line-of-sight planning zone' },
      { km: 60, color: '#ee8f8f', label: '60 km · exceptional line-of-sight planning zone' },
    ];
    [...rings].reverse().forEach(ring => {
      L.circle(SITE_COORDS, {
        radius: ring.km * 1000,
        color: ring.color,
        weight: 2,
        fillColor: ring.color,
        fillOpacity: 0.055,
        interactive: true,
      }).bindTooltip(ring.label).addTo(group);
    });
    group.addTo(map);
    return group;
  }

  function fixedSetBaseMap(kind, map) {
    const target = map || state.map;
    if (!target || !window.L) return;
    activeKind = kind === 'sat' ? 'sat' : 'topo';

    if (target === state.map && state.baseLayer) {
      try { target.removeLayer(state.baseLayer); } catch (_) {}
    }

    const layer = fixedCreateBaseLayer(activeKind);
    layer.addTo(target);

    if (target === state.map) {
      state.baseLayer = layer;
      document.getElementById('mapTopoBtn')?.classList.toggle('active', activeKind === 'topo');
      document.getElementById('mapSatBtn')?.classList.toggle('active', activeKind === 'sat');
    }

    setTimeout(() => target.invalidateSize(true), 100);
  }

  function installOverrides() {
    // Existing callbacks in dashboard.js resolve these global function bindings at click time.
    window.createBaseLayer = fixedCreateBaseLayer;
    window.addSiteMarker = fixedAddSiteMarker;
    window.buildCoverageLayer = fixedBuildCoverageLayer;
    window.setBaseMap = fixedSetBaseMap;
  }

  function bindReliableButtons() {
    const topo = document.getElementById('mapTopoBtn');
    const sat = document.getElementById('mapSatBtn');
    if (topo) topo.addEventListener('click', () => fixedSetBaseMap('topo'), { capture: true });
    if (sat) sat.addEventListener('click', () => fixedSetBaseMap('sat'), { capture: true });

    const coverage = document.getElementById('coverageBtn');
    if (coverage) {
      coverage.addEventListener('click', () => {
        setTimeout(() => {
          if (!state.map) return;
          state.map.invalidateSize(true);
          if (state.coverageVisible) {
            setStatus('Radio coverage planning overlay shown. Rings are not terrain-aware.', 'warn');
          } else {
            setStatus(`${activeKind === 'sat' ? 'Aerial imagery' : 'USGS topo'} loaded.`);
          }
        }, 120);
      });
    }
  }

  function observeSize() {
    if (!window.ResizeObserver) return;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => {
      if (state.map) state.map.invalidateSize(false);
      if (state.expandedMap) state.expandedMap.invalidateSize(false);
    });
    const site = document.getElementById('siteMap');
    const expanded = document.getElementById('expandedMap');
    if (site) resizeObserver.observe(site);
    if (expanded) resizeObserver.observe(expanded);
  }

  async function rebuildMainMap() {
    if (!(await ensureLeaflet())) return;
    installOverrides();

    if (state.map) {
      try { state.map.remove(); } catch (_) {}
      state.map = null;
      state.baseLayer = null;
      state.coverageLayer = null;
      state.coverageVisible = false;
    }

    const container = document.getElementById('siteMap');
    if (!container) return;
    container.innerHTML = '';

    state.map = L.map(container, {
      zoomControl: true,
      preferCanvas: true,
      minZoom: 3,
      maxZoom: 20,
    }).setView(SITE_COORDS, 12);

    fixedSetBaseMap('topo', state.map);
    fixedAddSiteMarker(state.map).openPopup();
    setTimeout(() => state.map.invalidateSize(true), 150);
    setTimeout(() => state.map.invalidateSize(true), 600);
    bindReliableButtons();
    observeSize();
  }

  // Patch expanded-map behavior independently so hidden-dialog sizing never leaves gray/partial tiles.
  function patchExpandedMap() {
    const original = window.openExpandedMap;
    window.openExpandedMap = function (title) {
      if (!window.L || !els?.expandDialog) return;
      els.expandTitle.textContent = title || 'Repeater site';
      els.expandedChart.hidden = true;
      els.expandedChart.innerHTML = '';
      els.expandedMap.hidden = false;
      els.expandDialog.showModal();

      if (state.expandedMap) {
        try { state.expandedMap.remove(); } catch (_) {}
        state.expandedMap = null;
      }

      setTimeout(() => {
        els.expandedMap.innerHTML = '';
        state.expandedMap = L.map('expandedMap', { preferCanvas: true, minZoom: 3, maxZoom: 20 })
          .setView(SITE_COORDS, state.coverageVisible ? 8 : 12);
        fixedCreateBaseLayer(activeKind).addTo(state.expandedMap);
        fixedAddSiteMarker(state.expandedMap).openPopup();
        if (state.coverageVisible) fixedBuildCoverageLayer(state.expandedMap);
        state.expandedMap.invalidateSize(true);
        setTimeout(() => state.expandedMap?.invalidateSize(true), 250);
      }, 80);
    };

    // Existing expand button was bound to the old function. Add a capture handler for the map button.
    document.querySelectorAll('[data-expand-map]').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopImmediatePropagation();
        window.openExpandedMap(btn.dataset.title);
      }, { capture: true });
    });
  }

  rebuildMainMap().then(() => patchExpandedMap()).catch(err => {
    console.error('Hidden Valley map patch failed', err);
    setStatus('Map initialization failed. Refresh the page.', 'bad');
  });
})();
