// The four environmental monitoring stations store telemetry only in moab_watersheds.
// Other Meshtastic stations continue using neondb.
export const WATERSHED_NODES = new Set([1949224949, 1695962694, 2425602407, 2004386937]);
export function isWatershedNode(nodeNum) { return WATERSHED_NODES.has(Number(nodeNum)); }
