(() => {
  const SWELL_MAP = {
    key: 'sw',
    node: 1949224949,
    id: '!742ecff5',
    name: "It's a Swell Day",
    fullName: "It's a Swell Day",
    short: 'SWRP',
    color: '#57b7ff',
    coords: [38.54279, -110.49269],
    elevationFt: 6000,
    battery: true,
  };

  // Register Swell with the shared map helpers. Expanded maps call addMarkers()
  // after the dialog opens, so registering here automatically includes Swell there.
  STATIONS.sw = SWELL_MAP;

  // Final page copy runs after Fishlake + Swell extension scripts so older extension
  // wording cannot overwrite the current four-station gateway architecture.
  const heroTitle = document.querySelector('.hero-intro h1');
  if (heroTitle) heroTitle.textContent = 'Four permanent temperature stations. One view.';
  const heroText = document.querySelector('.hero-intro p');
  if (heroText) heroText.textContent = "Hidden Valley, Fishlake Hightop, and It's a Swell Day report through the LoRa mesh. Heltec Home reads its local HOBO over BLE; each Home temperature reading normally flushes the synchronized station batch to Vercel/Neon, with a 70-minute safety fallback.";
  const pipeline = document.querySelector('.pipeline span');
  if (pipeline) pipeline.textContent = 'HOBO sensors → Meshtastic / Heltec → Home-triggered HTTPS batch → Vercel ingest → Neon history → dashboard';
  const footer = document.querySelector('footer span:first-child');
  if (footer) footer.textContent = "Meshtastic environmental network · Hidden Valley + Heltec Home + Fishlake Hightop + It's a Swell Day · Home-triggered cloud batching with independent safety flush";

  const flPath = document.querySelector('.fl-detail .path-note span');
  if (flPath) flPath.textContent = 'HOBO → BLE → Fishlake Hightop RAK → LoRa mesh → Heltec Home → synchronized cloud batch';
  const swPath = document.querySelector('.sw-detail .path-note span');
  if (swPath) swPath.textContent = "HOBO → BLE → It's a Swell Day RAK → LoRa mesh → Heltec Home → synchronized cloud batch";

  const detailText = document.querySelector('.sw-detail .station-panel-head p');
  if (detailText) detailText.textContent = '38.54279, -110.49269 · 6,000 ft · RAK WisBlock 4631 · MX2201';

  const mapText = document.querySelector('.map-panel .panel-head p');
  if (mapText) mapText.textContent = "Hidden Valley, Fishlake Hightop, It's a Swell Day, and approximate Heltec Home locations";

  function allCoords() {
    return Object.values(STATIONS).map(s => s?.coords).filter(c => Array.isArray(c) && c.length === 2);
  }

  function mapStatusText() {
    return state.mapKind === 'sat'
      ? 'Satellite imagery · four station locations'
      : 'USGS topo · four station locations';
  }

  function addSwellMarkerToMainMap() {
    if (!window.L || !state.map || window.__swellMainMapMarker) return;
    const marker = L.circleMarker(SWELL_MAP.coords, {
      radius: 9,
      color: '#edf7f6',
      weight: 2,
      fillColor: SWELL_MAP.color,
      fillOpacity: 1,
    }).addTo(state.map);

    marker.bindPopup(
      `<strong>${esc(SWELL_MAP.fullName)}</strong><br>` +
      `${SWELL_MAP.coords[0].toFixed(5)}, ${SWELL_MAP.coords[1].toFixed(5)}<br>` +
      `${SWELL_MAP.elevationFt.toLocaleString()} ft elevation<br>` +
      '<span style="color:#91aab0">Remote station location</span>'
    );

    window.__swellMainMapMarker = marker;
    const bounds = allCoords();
    if (bounds.length) state.map.fitBounds(bounds, { padding: [45, 45], maxZoom: 12 });
    setText('mapStatus', mapStatusText());
    setTimeout(() => state.map?.invalidateSize(true), 100);
  }

  addSwellMarkerToMainMap();

  // Fishlake already wraps setMapKind; wrap the current implementation so the
  // final status consistently reflects the four-station map after layer changes.
  const previousSetMapKind = setMapKind;
  setMapKind = function(kind, map = state.map) {
    previousSetMapKind(kind, map);
    if (map === state.map) setText('mapStatus', mapStatusText());
  };

  // Keep all known station history visible on first load. Fishlake's last stored
  // reading currently predates seven days, so a 7D default made that station look
  // deleted even though its records still exist. Health badges remain age-based.
  if (state.hours !== 720) {
    state.hours = 720;
    document.querySelectorAll('#tabs button[data-hours]').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.hours) === 720);
    });
    loadData();
  }
})();
