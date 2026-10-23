import test from "node:test";
import assert from "node:assert/strict";
import type React from "react";

import {
  MIDDLE_MOUSE_BUTTON,
  TAB_DRAG_THRESHOLD_PX,
  handleTabCloseButtonMouseDown,
  handleTabDragThresholdDragStart,
  handleTabDragThresholdMouseDown,
  handleTabDragThresholdReset,
  handleTabMiddleClickClose,
  handleTabMiddleMouseDown,
} from "./tabInteractions.ts";

interface FakeMouseEvent {
  button: number;
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}

const makeEvent = (button: number, clientX = 0, clientY = 0) => {
  const calls = { preventDefault: 0, stopPropagation: 0 };
  const event = {
    button,
    clientX,
    clientY,
    preventDefault: () => {
      calls.preventDefault++;
    },
    stopPropagation: () => {
      calls.stopPropagation++;
    },
  } satisfies FakeMouseEvent;
  return { event: event as unknown as React.MouseEvent, calls };
};

const beginPrimaryPress = (clientX: number, clientY: number) => {
  const press = makeEvent(0, clientX, clientY);
  handleTabDragThresholdMouseDown(press.event);
  return press;
};

test("handleTabMiddleClickClose closes the tab on a middle click", () => {
  let closed = 0;
  const { event, calls } = makeEvent(MIDDLE_MOUSE_BUTTON);

  handleTabMiddleClickClose(event, () => {
    closed++;
  });

  assert.equal(closed, 1);
  assert.equal(calls.preventDefault, 1);
  assert.equal(calls.stopPropagation, 1);
});

test("handleTabMiddleClickClose ignores left and right clicks", () => {
  for (const button of [0, 2]) {
    let closed = 0;
    const { event, calls } = makeEvent(button);

    handleTabMiddleClickClose(event, () => {
      closed++;
    });

    assert.equal(closed, 0, `button ${button} must not close the tab`);
    assert.equal(calls.preventDefault, 0);
  }
});

test("handleTabMiddleMouseDown suppresses autoscroll only for the middle button", () => {
  const middle = makeEvent(MIDDLE_MOUSE_BUTTON);
  handleTabMiddleMouseDown(middle.event);
  assert.equal(middle.calls.preventDefault, 1);

  const left = makeEvent(0);
  handleTabMiddleMouseDown(left.event);
  assert.equal(left.calls.preventDefault, 0);
});

test("handleTabDragThresholdDragStart cancels a drag that stays under the movement threshold", () => {
  handleTabDragThresholdReset();
  for (const distance of [0, TAB_DRAG_THRESHOLD_PX - 1]) {
    const press = beginPrimaryPress(10, 20);
    assert.equal(press.calls.preventDefault, 0, "primary mousedown must still allow a later drag");

    const drag = makeEvent(0, 10 + distance, 20);
    const cancelled = handleTabDragThresholdDragStart(drag.event as unknown as React.DragEvent);
    assert.equal(cancelled, true, `distance ${distance} must cancel dragstart`);
    assert.equal(drag.calls.preventDefault, 1, `distance ${distance} must preventDefault`);
  }
  handleTabDragThresholdReset();
});

test("handleTabDragThresholdDragStart leaves drags at or above the threshold alone", () => {
  handleTabDragThresholdReset();
  for (const distance of [TAB_DRAG_THRESHOLD_PX, TAB_DRAG_THRESHOLD_PX + 12]) {
    beginPrimaryPress(5, 8);
    const drag = makeEvent(0, 5 + distance, 8);
    const cancelled = handleTabDragThresholdDragStart(drag.event as unknown as React.DragEvent);
    assert.equal(cancelled, false, `distance ${distance} must keep the reorder drag`);
    assert.equal(drag.calls.preventDefault, 0, `distance ${distance} must not preventDefault`);
  }
  handleTabDragThresholdReset();
});

test("handleTabDragThreshold ignores non-primary buttons", () => {
  handleTabDragThresholdReset();
  for (const button of [MIDDLE_MOUSE_BUTTON, 2]) {
    const press = makeEvent(button, 4, 6);
    handleTabDragThresholdMouseDown(press.event);
    assert.equal(
      press.calls.preventDefault,
      button === MIDDLE_MOUSE_BUTTON ? 1 : 0,
      `button ${button} mousedown preventDefault count`,
    );

    const drag = makeEvent(button, 4, 6);
    const cancelled = handleTabDragThresholdDragStart(drag.event as unknown as React.DragEvent);
    assert.equal(cancelled, false, `button ${button} must not cancel dragstart`);
    assert.equal(drag.calls.preventDefault, 0, `button ${button} dragstart must not preventDefault`);
  }
  handleTabDragThresholdReset();
});

test("handleTabDragThresholdReset drops a press so the next drag is not judged from stale coordinates", () => {
  handleTabDragThresholdReset();
  beginPrimaryPress(0, 0);
  handleTabDragThresholdReset();

  const drag = makeEvent(0, 1, 0);
  const cancelled = handleTabDragThresholdDragStart(drag.event as unknown as React.DragEvent);
  assert.equal(cancelled, false);
  assert.equal(drag.calls.preventDefault, 0);

  beginPrimaryPress(0, 0);
  const next = makeEvent(0, 1, 0);
  assert.equal(handleTabDragThresholdDragStart(next.event as unknown as React.DragEvent), true);
  handleTabDragThresholdReset();
});

test("handleTabCloseButtonMouseDown blocks ancestor drag only for the primary button", () => {
  const left = makeEvent(0);
  handleTabCloseButtonMouseDown(left.event);
  assert.equal(left.calls.preventDefault, 1);
  assert.equal(left.calls.stopPropagation, 1);

  for (const button of [MIDDLE_MOUSE_BUTTON, 2]) {
    const other = makeEvent(button);
    handleTabCloseButtonMouseDown(other.event);
    assert.equal(other.calls.preventDefault, 0, `button ${button} must not preventDefault`);
    assert.equal(other.calls.stopPropagation, 0, `button ${button} must not stopPropagation`);
  }
});
