// Hidden Valley terrain-aware RF coverage view.
// Uses the official Meshtastic Site Planner via its documented query hand-off.
(function () {
  const SITE = { lat: 38.53880, lon: -109.5409 };
  const PARAMS = new URLSearchParams({
    lat: String(SITE.lat),
    lon: String(SITE.lon),
    name: 'Hidden Valley Repeater',
    tx_power: '0.158',       // RAK4631 / SX1262 nominal max: 22 dBm
    tx_freq: '906.875',      // Hidden Valley US915 working frequency used by this deployment
    tx_height: '0.5',        // metres AGL
    tx_gain: '2',            // official planner RAK WisBlock stock-antenna estimate
    rx_sensitivity: '-130',  // LongFast planning threshold
    rx_height: '1',
    rx_loss: '2',
    max_range: '30',         // km; high-resolution terrain mode
    high_res: '1',
    color_scale: 'turbo',
    min_dbm: '-130',
    max_dbm: '-80',
    overlay_transparency: '35',
    run: '1',
  });

  const plannerUrl = `https://site.meshtastic.org/?${PARAMS.toString()}`;

  function getDialog() {
    let dialog = document.getElementById('coverageDialog');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'coverageDialog';
    dialog.className = 'coverage-dialog';
    dialog.innerHTML = `
      <div class="coverage-dialog-head">
        <div>
          <span class="eyebrow">Terrain-aware RF simulation</span>
          <h2>Hidden Valley coverage heatmap</h2>
          <p>Official Meshtastic Site Planner · ITM/Longley-Rice · high-resolution terrain</p>
        </div>
        <div class="coverage-dialog-actions">
          <a id="coverageOpenFull" class="coverage-link-btn" target="_blank" rel="noopener noreferrer">Open full planner</a>
          <button type="button" id="coverageClose">Close</button>
        </div>
      </div>
      <div class="coverage-params">
        <span><strong>RAK4631</strong> 22 dBm</span>
        <span>2 dBi antenna estimate</span>
        <span>0.5 m AGL</span>
        <span>906.875 MHz</span>
        <span>−130 dBm threshold</span>
        <span>30 km · 30 m terrain</span>
      </div>
      <div id="coverageFrameStatus" class="coverage-frame-status">Starting terrain simulation…</div>
      <iframe id="coverageFrame" class="coverage-frame" title="Meshtastic terrain-aware radio coverage heatmap" loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>
    `;
    document.body.appendChild(dialog);

    const frame = dialog.querySelector('#coverageFrame');
    const status = dialog.querySelector('#coverageFrameStatus');
    const openFull = dialog.querySelector('#coverageOpenFull');
    openFull.href = plannerUrl;

    frame.addEventListener('load', () => {
      status.textContent = 'Planner loaded. Terrain download and RF calculation run in your browser; the colored pixels are modeled signal strength.';
      status.classList.add('loaded');
    });

    dialog.querySelector('#coverageClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (ev) => {
      if (ev.target === dialog) dialog.close();
    });
    return dialog;
  }

  function clearOldCoverageRings() {
    try {
      if (typeof state !== 'undefined' && state.map && state.coverageLayer) {
        state.map.removeLayer(state.coverageLayer);
        state.coverageLayer = null;
        state.coverageVisible = false;
      }
    } catch (_) {}
    const legacy = document.getElementById('coverageLegend');
    if (legacy) legacy.hidden = true;
  }

  function openCoverage() {
    clearOldCoverageRings();
    const dialog = getDialog();
    const frame = dialog.querySelector('#coverageFrame');
    const status = dialog.querySelector('#coverageFrameStatus');
    const button = document.getElementById('coverageBtn');

    if (!frame.src || frame.src === 'about:blank') {
      frame.src = plannerUrl;
    }
    if (status) {
      status.textContent = 'Starting high-resolution terrain simulation…';
      status.classList.remove('loaded');
    }
    button?.classList.add('active');
    dialog.showModal();
  }

  // Capture before the legacy ring-overlay click handler and replace it completely.
  document.addEventListener('click', (ev) => {
    const button = ev.target.closest?.('#coverageBtn');
    if (!button) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    openCoverage();
  }, true);

  const legacy = document.getElementById('coverageLegend');
  if (legacy) legacy.hidden = true;
})();
