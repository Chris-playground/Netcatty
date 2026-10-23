import type React from "react";

/**
 * The DOM `MouseEvent.button` value for the middle mouse button (wheel click).
 * 0 = left/primary, 1 = middle, 2 = right/secondary.
 */
export const MIDDLE_MOUSE_BUTTON = 1;

/**
 * Suppress the Chromium/Electron middle-click autoscroll affordance on a tab.
 * Wire to `onMouseDown`: autoscroll is armed on mousedown, so preventing the
 * default there stops the panning-cursor overlay from appearing when a user
 * middle-clicks a tab to close it (#1044).
 */
export const handleTabMiddleMouseDown = (e: React.MouseEvent): void => {
  if (e.button === MIDDLE_MOUSE_BUTTON) {
    e.preventDefault();
  }
};

/**
 * Keep a primary-button press on a tab close control from starting an HTML5
 * drag on the ancestor `draggable` tab. Chromium promotes a few pixels of
 * movement between mousedown and mouseup into `dragstart`, which swallows the
 * click (#3886). `preventDefault` stops that drag; `stopPropagation` keeps the
 * tab's own mousedown handler from seeing the press. Middle and right buttons
 * are left alone so aux-click close and context menus stay unchanged.
 */
export const handleTabCloseButtonMouseDown = (e: React.MouseEvent): void => {
  if (e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
};

/**
 * Pointer travel below this is a click, not a tab reorder. Chromium can fire
 * `dragstart` after about 2px on a `draggable` tab and cancel the click that
 * would activate it (#3886).
 */
export const TAB_DRAG_THRESHOLD_PX = 4;

let tabDragOrigin: { x: number; y: number } | null = null;

/**
 * Record a primary-button press on a draggable tab root, and keep middle-click
 * autoscroll suppression. Wire to the tab root `onMouseDown`. Non-primary
 * buttons are not tracked, so they cannot cancel a later drag.
 */
export const handleTabDragThresholdMouseDown = (e: React.MouseEvent): void => {
  handleTabMiddleMouseDown(e);
  if (e.button !== 0) return;
  tabDragOrigin = { x: e.clientX, y: e.clientY };
};

/**
 * Cancel `dragstart` when the pointer has not moved far enough to reorder the
 * tab, so the subsequent click still activates it. Returns true when the drag
 * was cancelled. At or above the threshold, returns false and leaves the event
 * alone for `onTabDragStart`.
 */
export const handleTabDragThresholdDragStart = (e: React.DragEvent): boolean => {
  const origin = tabDragOrigin;
  tabDragOrigin = null;
  if (!origin) return false;
  const distance = Math.hypot(e.clientX - origin.x, e.clientY - origin.y);
  if (distance < TAB_DRAG_THRESHOLD_PX) {
    e.preventDefault();
    return true;
  }
  return false;
};

/** Drop a tracked press on mouseup or dragend so the next gesture starts clean. */
export const handleTabDragThresholdReset = (): void => {
  tabDragOrigin = null;
};

/**
 * Close a tab when it is middle-clicked. Wire to `onAuxClick`, which fires for
 * a completed non-primary click. Left clicks (tab activation) and right clicks
 * (context menu) are ignored so existing behavior is untouched.
 */
export const handleTabMiddleClickClose = (
  e: React.MouseEvent,
  close: () => void,
): void => {
  if (e.button !== MIDDLE_MOUSE_BUTTON) return;
  e.preventDefault();
  e.stopPropagation();
  close();
};
