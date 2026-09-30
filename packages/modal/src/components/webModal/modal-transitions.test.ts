import {
  animateAndCommit,
  applyStyle,
  EASE_IN_OUT_QUAD,
  EASE_OUT_SWIPE,
  ENTER_OFFSET_IN_PX,
  getBackdropOpacity,
  getContentEnterKeyframes,
  getContentExitKeyframes,
  getFadeKeyframes,
  runWebAnimation,
  SWIPE_RETURN_DURATION_IN_MS,
} from "./modal-transitions";

/**
 * The browser chrome's motion, checked against the Reanimated presets it stands
 * in for. The offsets and the easing are copied out of Reanimated 4's
 * `defaultAnimations/Fade.ts`, which is the only reason a modal looks the same
 * in a browser as it does on a device — nothing in the build would notice if
 * they drifted.
 *
 * The Web Animations API itself is not available here: `Element.animate` is a
 * browser API, and `runWebAnimation` is written to degrade to landing on the
 * final keyframe without it. That fallback is what these exercise; the real
 * animation is covered by `examples/next-web/tools/browser-smoke.mjs`.
 */

const fakeElement = () =>
  ({ style: {} }) as unknown as HTMLElement & { style: Record<string, string> };

describe("content keyframes", () => {
  it("enters from the direction it would be swiped away in", () => {
    expect(getContentEnterKeyframes("down")).toStrictEqual([
      { opacity: 0, transform: `translate3d(0px, ${ENTER_OFFSET_IN_PX}px, 0)` },
      { opacity: 1, transform: "translate3d(0px, 0px, 0)" },
    ]);
  });

  it("exits back the same way", () => {
    expect(getContentExitKeyframes("down")).toStrictEqual([
      { opacity: 1, transform: "translate3d(0px, 0px, 0)" },
      { opacity: 0, transform: `translate3d(0px, ${ENTER_OFFSET_IN_PX}px, 0)` },
    ]);
  });

  it("mirrors Reanimated's sign for every direction", () => {
    const offsets = (["up", "down", "left", "right"] as const).map(
      (direction) => getContentEnterKeyframes(direction)[0]?.transform,
    );

    expect(offsets).toStrictEqual([
      "translate3d(0px, -25px, 0)",
      "translate3d(0px, 25px, 0)",
      "translate3d(-25px, 0px, 0)",
      "translate3d(25px, 0px, 0)",
    ]);
  });
});

describe("backdrop tracking", () => {
  it("is opaque at rest and clear a screen away", () => {
    expect(getBackdropOpacity({ range: 800, translation: 0 })).toBe(1);
    expect(getBackdropOpacity({ range: 800, translation: 800 })).toBe(0);
    expect(getBackdropOpacity({ range: 800, translation: 400 })).toBe(0.5);
  });

  it("clamps past both ends, like the native interpolation", () => {
    expect(getBackdropOpacity({ range: 800, translation: 2000 })).toBe(0);
    expect(getBackdropOpacity({ range: 800, translation: -2000 })).toBe(1);
  });

  it("survives a zero-height window rather than dividing by it", () => {
    expect(getBackdropOpacity({ range: 0, translation: 10 })).toBe(1);
  });
});

describe("without the Web Animations API", () => {
  it("lands on the final keyframe instead of animating", async () => {
    const node = fakeElement();

    const animation = runWebAnimation(node, getContentEnterKeyframes("down"), {
      duration: 250,
    });
    await animation.finished;

    expect(node.style).toStrictEqual({
      opacity: "1",
      transform: "translate3d(0px, 0px, 0)",
    });
  });

  it("resolves for a node that never mounted", async () => {
    await expect(
      runWebAnimation(null, getContentExitKeyframes("up"), { duration: 250 })
        .finished,
    ).resolves.toBeUndefined();
  });

  it("commits the final values so the next drag can write over them", async () => {
    const node = fakeElement();

    await animateAndCommit(
      node,
      [{ transform: "translate3d(0px, 40px, 0)" }, { transform: "none" }],
      { duration: 220 },
    );

    expect(node.style.transform).toBe("none");
  });
});

describe("applyStyle", () => {
  it("writes only the properties a keyframe carries", () => {
    const node = fakeElement();
    node.style.transform = "translate3d(0px, 5px, 0)";

    applyStyle(node, { opacity: 0.5 });

    expect(node.style).toStrictEqual({
      opacity: "0.5",
      transform: "translate3d(0px, 5px, 0)",
    });
  });

  it("ignores a missing node or a missing keyframe", () => {
    expect(() => {
      applyStyle(null, { opacity: 1 });
      applyStyle(fakeElement(), undefined);
    }).not.toThrow();
  });
});

describe("easing", () => {
  it("uses the cubic-bezier form of Easing.inOut(Easing.quad)", () => {
    // Reanimated's `withTiming` default, which is what a layout animation gets
    // when the modal only sets `.duration()`.
    expect(EASE_IN_OUT_QUAD).toBe("cubic-bezier(0.455, 0.03, 0.515, 0.955)");
  });
});

describe("backdrop fade", () => {
  it("fades in on entrance and out on exit", () => {
    // magic-modal.browser.tsx plays getFadeKeyframes(0, 1) on mount and
    // getFadeKeyframes(1, 0) once the portal starts the exit.
    expect(getFadeKeyframes(0, 1)).toStrictEqual([
      { opacity: 0 },
      { opacity: 1 },
    ]);
    expect(getFadeKeyframes(1, 0)).toStrictEqual([
      { opacity: 1 },
      { opacity: 0 },
    ]);
  });

  it("settles a released drag back with the swipe easing", () => {
    // use-swipe-dismiss.ts settleBack runs SWIPE_RETURN_DURATION_IN_MS at
    // EASE_OUT_SWIPE, the stand-in for the native springs.
    expect(EASE_OUT_SWIPE).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(SWIPE_RETURN_DURATION_IN_MS).toBe(220);
  });
});
