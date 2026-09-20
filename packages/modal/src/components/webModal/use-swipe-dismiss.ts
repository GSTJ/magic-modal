/* eslint-disable react/immutability -- The hook is handed a DOM node so it can
 * drive it: it sets `touch-action` on the dialog and writes transforms and
 * opacity to the layers as the finger moves. The rule reads every one of those
 * as mutating a hook argument. Painting a drag through React state instead
 * would mean a render per pointer event, which is exactly what the native
 * chrome uses the UI thread to avoid. Same call as the one at the top of
 * `magic-modal.tsx`: oxlint 1.79 split the old `react/react-compiler` nursery
 * rule this comment used to name into per-category rules (oxc-project/oxc#25500);
 * `react/immutability` is the one that now covers these hits. DECISIONS.md
 * in GSTJ/magic says to switch it off locally when it misbehaves rather than
 * contort the code.
 */

import type { Direction } from "../../constants/types";
import type { SwipeDragState, SwipePoint } from "./swipe-gesture";

import type { RefObject } from "react";

import { useEffect, useRef } from "react";

import { TOUCH_SLOP } from "../../constants/gestures";
import {
  animateAndCommit,
  EASE_OUT_SWIPE,
  getBackdropOpacity,
  SWIPE_RETURN_DURATION_IN_MS,
  translate3d,
} from "./modal-transitions";
import {
  beginSwipeDrag,
  endSwipeDrag,
  getSwipeRange,
  getSwipeTouchAction,
  isHorizontalDirection,
  updateSwipeDrag,
} from "./swipe-gesture";

type SwipeDismissOptions = {
  backdropRef: RefObject<HTMLElement | null>;
  dampingFactor: number;
  /** Milliseconds the fling off screen takes once the swipe is committed. */
  dismissDuration: number;
  height: number;
  motionRef: RefObject<HTMLElement | null>;
  onDismissed: () => void;
  velocityThreshold: number;
  width: number;
};

type ActiveDrag = SwipeDragState & { pointerID: number };

const readOpacity = (node: HTMLElement | null) =>
  Number(node?.style.opacity || 1);

/**
 * Pointer capture keeps a drag alive once the finger leaves the dialog. It is
 * an enhancement rather than a requirement — without it a drag that wanders off
 * the element simply stops — so anything missing it is skipped instead of
 * throwing.
 */
const canCapturePointer = (node: HTMLElement) =>
  typeof node.setPointerCapture === "function" &&
  typeof node.hasPointerCapture === "function";

/**
 * Swipe-to-dismiss on Pointer Events, standing in for gesture-handler.
 *
 * A drag starts on the dialog and then belongs to the document — see the note
 * on the listeners below for why it cannot stay on the element. Pointer capture
 * is claimed on top of that once the drag activates: it keeps the gesture alive
 * past the edge of the window, and it takes the rest of the pointer away from
 * whatever was being pressed, the same way an activating native gesture cancels
 * the touch under it.
 *
 * All of the arithmetic — damping, the activation slop, the velocity test —
 * lives in `swipe-gesture.ts` next to its unit tests. This hook is the DOM half.
 */
export const useSwipeDismiss = ({
  dialogNode,
  direction,
  ...options
}: SwipeDismissOptions & {
  dialogNode: HTMLElement | null;
  direction: Direction | undefined;
}) => {
  /** Where the modal rests between drags. Each drag accumulates onto it. */
  const translationRef = useRef<SwipePoint>({ x: 0, y: 0 });
  const dragRef = useRef<ActiveDrag | null>(null);

  // Everything that can change without the listeners needing to be re-attached
  // is read through a ref, so a re-render never interrupts a drag in flight.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    if (!dialogNode || !direction) {
      return;
    }

    dialogNode.style.touchAction = getSwipeTouchAction(direction);

    /** Set when a drag activates, so the click it ends on is not a press. */
    let shouldSwallowClick = false;

    const getRange = () =>
      getSwipeRange({
        direction,
        height: latest.current.height,
        width: latest.current.width,
      });

    const paint = (translation: SwipePoint) => {
      const { backdropRef, motionRef } = latest.current;

      if (motionRef.current) {
        motionRef.current.style.transform = translate3d(translation);
      }

      if (backdropRef.current) {
        backdropRef.current.style.opacity = String(
          getBackdropOpacity({
            range: getRange(),
            translation: isHorizontalDirection(direction)
              ? translation.x
              : translation.y,
          }),
        );
      }
    };

    const settleBack = (from: SwipePoint) => {
      const { backdropRef, motionRef } = latest.current;
      const timing = {
        duration: SWIPE_RETURN_DURATION_IN_MS,
        easing: EASE_OUT_SWIPE,
      };

      translationRef.current = { x: 0, y: 0 };

      void animateAndCommit(
        motionRef.current,
        [
          { transform: translate3d(from) },
          { transform: translate3d({ x: 0, y: 0 }) },
        ],
        timing,
      );
      void animateAndCommit(
        backdropRef.current,
        [{ opacity: readOpacity(backdropRef.current) }, { opacity: 1 }],
        timing,
      );
    };

    const flingAway = async (from: SwipePoint) => {
      const { backdropRef, dismissDuration, motionRef, onDismissed } =
        latest.current;
      const range = getRange();
      const target = isHorizontalDirection(direction)
        ? { x: range, y: from.y }
        : { x: from.x, y: range };
      const timing = { duration: dismissDuration, easing: EASE_OUT_SWIPE };

      translationRef.current = target;

      await Promise.all([
        animateAndCommit(
          motionRef.current,
          [
            { transform: translate3d(from) },
            { transform: translate3d(target) },
          ],
          timing,
        ),
        animateAndCommit(
          backdropRef.current,
          [{ opacity: readOpacity(backdropRef.current) }, { opacity: 0 }],
          timing,
        ),
      ]);

      onDismissed();
    };

    const handlePointerDown = (event: PointerEvent) => {
      // Secondary buttons never start a drag, and a second finger joins the one
      // already dragging instead of starting its own.
      if (event.button !== 0 || dragRef.current) {
        return;
      }

      dragRef.current = {
        ...beginSwipeDrag({
          point: { x: event.clientX, y: event.clientY },
          previous: translationRef.current,
          time: event.timeStamp,
        }),
        pointerID: event.pointerId,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;

      if (!drag || drag.pointerID !== event.pointerId) {
        return;
      }

      const next = updateSwipeDrag(drag, {
        dampingFactor: latest.current.dampingFactor,
        direction,
        minDistance: TOUCH_SLOP,
        point: { x: event.clientX, y: event.clientY },
        time: event.timeStamp,
      });

      dragRef.current = { ...next, pointerID: drag.pointerID };

      if (!next.isActive) {
        return;
      }

      if (
        canCapturePointer(dialogNode) &&
        !dialogNode.hasPointerCapture(event.pointerId)
      ) {
        dialogNode.setPointerCapture(event.pointerId);
      }

      shouldSwallowClick = true;
      paint(next.translation);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const drag = dragRef.current;

      if (!drag || drag.pointerID !== event.pointerId) {
        return;
      }

      dragRef.current = null;

      if (
        canCapturePointer(dialogNode) &&
        dialogNode.hasPointerCapture(event.pointerId)
      ) {
        dialogNode.releasePointerCapture(event.pointerId);
      }

      // A press that never passed the slop left nothing to undo.
      if (!drag.isActive) {
        return;
      }

      // A cancelled pointer was never released, so it cannot have thrown the
      // modal anywhere: it always settles back.
      const shouldDismiss =
        event.type !== "pointercancel" &&
        endSwipeDrag(drag, {
          direction,
          velocityThreshold: latest.current.velocityThreshold,
        }).shouldDismiss;

      if (shouldDismiss) {
        void flingAway(drag.translation);
        return;
      }

      settleBack(drag.translation);
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (!shouldSwallowClick) {
        return;
      }

      shouldSwallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    // A drag can only start on the modal, so `pointerdown` is the dialog's.
    //
    // The rest of the gesture is the document's. The dialog wrapper carries
    // `pointer-events: none` — it is the `box-none` layer that lets presses
    // through to whatever the modal renders — so it is never a hit target
    // itself, and the moment the pointer moves off the element it went down on,
    // nothing bubbles back through it. Watching the document instead means the
    // drag keeps its events wherever the finger travels.
    const { ownerDocument } = dialogNode;

    dialogNode.addEventListener("pointerdown", handlePointerDown);
    dialogNode.addEventListener("click", handleClickCapture, true);
    ownerDocument.addEventListener("pointermove", handlePointerMove);
    ownerDocument.addEventListener("pointerup", handlePointerEnd);
    ownerDocument.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      dragRef.current = null;
      dialogNode.style.touchAction = "";
      dialogNode.removeEventListener("pointerdown", handlePointerDown);
      dialogNode.removeEventListener("click", handleClickCapture, true);
      ownerDocument.removeEventListener("pointermove", handlePointerMove);
      ownerDocument.removeEventListener("pointerup", handlePointerEnd);
      ownerDocument.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [dialogNode, direction]);
};
