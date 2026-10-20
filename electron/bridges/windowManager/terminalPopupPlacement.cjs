"use strict";

function area(rect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function intersects(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function finishFrame(x, y, width, height, workArea) {
  const frame = {
    width: Math.round(Math.min(width, workArea.width)),
    height: Math.round(Math.min(height, workArea.height)),
  };
  const maxX = workArea.x + workArea.width - frame.width;
  const maxY = workArea.y + workArea.height - frame.height;
  frame.x = Math.round(clamp(x, workArea.x, maxX));
  frame.y = Math.round(clamp(y, workArea.y, maxY));
  return frame;
}

/**
 * Place a terminal popup in the largest region of the source window that does
 * not cover `avoid` (the system-manager panel). Without a usable gap, center
 * on the source window.
 */
function placeTerminalPopup({
  workArea,
  sourceBounds,
  avoid,
  width,
  height,
  minWidth = 480,
  minHeight = 320,
}) {
  const preferred = {
    width: Math.min(width, workArea.width),
    height: Math.min(height, workArea.height),
  };
  const slots = [];
  if (avoid && avoid.width > 0 && avoid.height > 0) {
    const sourceRight = sourceBounds.x + sourceBounds.width;
    const sourceBottom = sourceBounds.y + sourceBounds.height;
    const avoidRight = avoid.x + avoid.width;
    const avoidBottom = avoid.y + avoid.height;
    const push = (rect) => {
      if (rect.width >= 1 && rect.height >= 1) slots.push(rect);
    };
    push({
      x: sourceBounds.x,
      y: sourceBounds.y,
      width: avoid.x - sourceBounds.x,
      height: sourceBounds.height,
    });
    push({
      x: avoidRight,
      y: sourceBounds.y,
      width: sourceRight - avoidRight,
      height: sourceBounds.height,
    });
    push({
      x: sourceBounds.x,
      y: sourceBounds.y,
      width: sourceBounds.width,
      height: avoid.y - sourceBounds.y,
    });
    push({
      x: sourceBounds.x,
      y: avoidBottom,
      width: sourceBounds.width,
      height: sourceBottom - avoidBottom,
    });
  }

  const slot = slots
    .filter((candidate) => candidate.width >= minWidth && candidate.height >= minHeight)
    .sort((a, b) => area(b) - area(a))[0];
  if (!slot) {
    return finishFrame(
      sourceBounds.x + (sourceBounds.width - preferred.width) / 2,
      sourceBounds.y + (sourceBounds.height - preferred.height) / 2,
      preferred.width,
      preferred.height,
      workArea,
    );
  }

  const popupWidth = Math.min(preferred.width, slot.width);
  const popupHeight = Math.min(preferred.height, slot.height);
  let frame = finishFrame(
    slot.x + (slot.width - popupWidth) / 2,
    slot.y + (slot.height - popupHeight) / 2,
    popupWidth,
    popupHeight,
    workArea,
  );
  if (intersects(frame, avoid)) {
    frame = {
      x: Math.round(slot.x),
      y: Math.round(slot.y),
      width: Math.round(popupWidth),
      height: Math.round(popupHeight),
    };
  }
  return frame;
}

module.exports = {
  intersects,
  placeTerminalPopup,
};
