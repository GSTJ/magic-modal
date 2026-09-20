import type { PanGestureSurfaceProps } from "./pan-gesture-surface.types";

import React, { useMemo } from "react";

import { Gesture, GestureDetector } from "react-native-gesture-handler";

/**
 * The gesture object `Gesture.Pan()` builds. Derived from the builder rather
 * than imported by name because the name moved: 2.x exports it as `PanGesture`,
 * and in 3.x that name belongs to the hook API's gesture instead.
 *
 * `Gesture.Pan` is deprecated on 3.x. That is deliberate here — see the note on
 * the builder call below. Nothing suppresses it: `typescript/no-deprecated` is
 * type-aware and off in the shared preset.
 */
export type LegacyPanGesture = ReturnType<typeof Gesture.Pan>;

/**
 * Swipe surface for gesture-handler 2.x, built on the `Gesture.Pan()` builder.
 *
 * 2.x's `GestureDetector` compares `gestureId` to decide whether to re-push the
 * gesture to the native side, and every `Gesture.Pan()` gets a fresh one, so
 * the builder is memoized on the spec rather than rebuilt each render.
 */
export const PanGestureSurfaceV2 = ({
  swipe,
  children,
}: PanGestureSurfaceProps) => {
  const pan = useMemo(
    () =>
      // `Gesture.Pan()` is the only swipe API gesture-handler 2.x has, and 3.x
      // marks the builder deprecated. The call is what keeps 2.x, and so every
      // current Expo SDK, working.
      // eslint-disable-next-line react/capitalized-calls -- `Gesture.Pan` is gesture-handler's builder factory, not a component; the rule has no way to tell. (oxlint 1.79 split the old `react/react-compiler` rule this comment used to name into per-category rules, oxc-project/oxc#25500.)
      Gesture.Pan()
        .enabled(swipe.enabled)
        .minDistance(swipe.minDistance)
        .onStart(swipe.onStart)
        .onUpdate(swipe.onUpdate)
        // Not `.onFinalize`: it also runs after gestures that never activated,
        // which would fire the dismissal spring on taps inside the modal.
        .onEnd(swipe.onEnd),
    [swipe],
  );

  return <GestureDetector gesture={pan}>{children}</GestureDetector>;
};
