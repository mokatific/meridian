/**
 * Paper position tool wrappers.
 *
 * The actual simulation lives in paper-positions.js — a live, forward-running
 * tracker that accrues fees and recomputes IL on a 5m tick. These wrappers
 * expose open/get/close/list to the agent's tool layer.
 */

import {
  openPaperPosition,
  getPaperPosition,
  closePaperPosition,
  listPaperPositions,
  tickPaperPositions,
} from "../paper-positions.js";

export async function openPaperPositionTool(args) {
  return openPaperPosition(args);
}

export function getPaperPositionTool(args) {
  return getPaperPosition(args);
}

export function closePaperPositionTool(args) {
  return closePaperPosition(args);
}

export function listPaperPositionsTool(args = {}) {
  return listPaperPositions(args);
}

// Re-exported so the cron job can drive ticks without reaching across modules.
export { tickPaperPositions };
