// Approved Meshtastic telemetry stations are stored once, in moab_watersheds.
// Archived station/node histories are also retained in that database.
export const WATERSHED_NODES = new Set([
  1949224949, 1695962694, 2425602407, 2004386937,
  1252758033, 1436900584, 1577197109, 1683604927,
  2224121796, 2650172798, 2740603892, 3044869407,
  4241345683, 647393146, 1222051909,
]);
export function isWatershedNode(nodeNum) { return WATERSHED_NODES.has(Number(nodeNum)); }
