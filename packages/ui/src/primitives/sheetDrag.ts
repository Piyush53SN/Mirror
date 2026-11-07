/**
 * Pure maths for dragging a bottom sheet. No React, so the dismissal rules can be tested directly.
 *
 * Snap points: the sheet has two resting positions, OPEN (offset 0) and DISMISSED (offset = its
 * height). A release either dismisses or snaps back to OPEN. Dragging up past OPEN is
 * rubber-banded, so the sheet resists and returns.
 */

/** Visible offset for a raw drag distance `dy` (positive = down). Resists upward drag and drags past 160 dp. */
export function sheetDragOffset(dy: number): number {
  if (dy < 0) return dy * 0.2;
  if (dy <= 160) return dy;
  return 160 + (dy - 160) * 0.5;
}

/**
 * Decide what a release does. Dismiss when dragged past a quarter of the sheet (or at least 96 dp),
 * or flicked down quickly. Anything else snaps back to OPEN.
 */
export function sheetReleaseAction(dy: number, vy: number, sheetHeight: number): 'dismiss' | 'snap' {
  if (dy <= 0) return 'snap';
  const threshold = Math.max(96, sheetHeight * 0.25);
  if (dy >= threshold) return 'dismiss';
  if (vy > 0.9 && dy > 24) return 'dismiss';
  return 'snap';
}

/** Whether a gesture has moved far enough, and mostly downwards, to count as a sheet drag. */
export function isSheetDragStart(dx: number, dy: number): boolean {
  return dy > 6 && Math.abs(dy) > Math.abs(dx) * 1.5;
}
