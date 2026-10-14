# Moab Watersheds

Creek-only monitoring site at https://seutahwatersheds.vercel.app.

Pack Creek (1949224949) is the only registered creek station. Temperature-only mesh stations are excluded. Uses a separate Postgres database **moab_watersheds**, with its own creek_stations, creek_observations, and creek_sync_state tables. This database shares the existing Neon compute/project but is a distinct database from Meshtastic's neondb.

Production hosts use the server-only WATERSHED_DATABASE_URL. The Meshtastic ingest function mirrors only water packets belonging to enabled creek stations. Its watershed API repairs any missed mirrors using a separate cursor, without using mirror results to advance the cursor. The independent watershed host queries its own database; it does not need the Meshtastic database credential.

Schema: ../migrations/20261014_moab_watersheds.sql. New creek stations must be explicitly registered in creek_stations and connected to ingest; they are not inferred from temperature telemetry. Frontend currently displays Pack Creek only.

UI source: repository-root watershed.html, watershed.css, watershed.js. Run node tools/prepare-watersheds.mjs from the repository root after source edits to refresh the standalone deployment folder. Deploy Vercel project seutahwatersheds from this folder. Existing Meshtastic /watershed serves the same interface.

Observation cards keep independent sensor timestamps. Streamflow comes from calibrated SEN0313 stage and the copied rating curve. HOBO MX2001 temperature and reference stage remain independent. Charts have 24-hour, 7-day and 30-day windows, break at gaps longer than three hours, and CSV exports include UTC, Mountain Time, sensor and rating status. No simulated measurements or fabricated station coordinates.
