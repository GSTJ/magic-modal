/* eslint-disable react/immutability -- Every hit in this file is
 * `sharedValue.value = …` inside a `"worklet"`. Assigning to `.value` is
 * Reanimated's only way to drive an animation from the UI thread, and the rule
 * reads it as mutating a hook's return value. Nothing here is a React render
 * mutation. oxlint 1.79 split the old `react/react-compiler` nursery rule this
 * comment used to name into per-category rules (oxc-project/oxc#25500);
 * `react/immutability` is the one that now covers these hits. DECISIONS.md in
 * GSTJ/magic says to switch it off locally when it misbehaves rather than
 * contort the code.
 */

import type { Direction, ModalChildren } from "../constants/types";
import type { ModalProps } from "../constants/types.react-native";
import type { SwipeGestureSpec } from "./panGesture";

import React, { memo, useCallback, useMemo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  FadeOut,
  FadeOutDown,
  FadeOutLeft,
  FadeOutRight,
  FadeOutUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { defaultDirection } from "../constants/default-config";
import { TOUCH_SLOP } from "../constants/gestures";
import { MagicModalHideReason } from "../constants/types";
import { useInternalMagicModal } from "./magic-modal-provider";
import { styles } from "./MagicModalPortal/magic-modal-portal.styles";
import { MODAL_DIALOG_TEST_ID, useWebModalFocus } from "./modal-accessibility";
import {
  getDialogAccessibilityProps,
  getStackEntryAccessibilityProps,
} from "./nativeModal/modal-accessibility";
import { PanGestureSurface } from "./panGesture";

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const defaultAnimationInMap = {
  up: FadeInUp,
  down: FadeInDown,
  left: FadeInLeft,
  right: FadeInRight,
} satisfies Record<Direction, unknown>;

export const defaultAnimationOutMap = {
  up: FadeOutUp,
  down: FadeOutDown,
  left: FadeOutLeft,
  right: FadeOutRight,
} satisfies Record<Direction, unknown>;

export const MagicModal = memo(
  ({
    config,
    children: Children,
    isTopmost,
  }: {
    config: ModalProps;
    children: ModalChildren;
    isTopmost: boolean;
  }) => {
    const { hide } = useInternalMagicModal();
    const [dialogNode, setDialogNode] = React.useState<View | null>(null);
    const { onBackButtonPress } = config;

    const translationX = useSharedValue(0);
    const translationY = useSharedValue(0);
    const prevTranslationX = useSharedValue(0);
    const prevTranslationY = useSharedValue(0);

    /**
     * Necessary to skip exit animation when swipe is complete.
     * This is a problem on web, where the exit animation does not
     * work properly with the swipe animation styles.
     *
     * This seems to be a bug in reanimated.
     */
    const [isSwipeComplete, _setIsSwipeComplete] = React.useState(false);

    const { width, height } = useWindowDimensions();

    const onBackdropPress = useMemo(() => {
      return config.onBackdropPress
        ? () => config.onBackdropPress?.({ hide })
        : () => {
            hide({ reason: MagicModalHideReason.BACKDROP_PRESS });
          };
    }, [config, hide]);

    const onSystemDismiss = useCallback(() => {
      if (onBackButtonPress) {
        onBackButtonPress({ hide });
        return;
      }

      hide({ reason: MagicModalHideReason.BACK_BUTTON_PRESS });
    }, [hide, onBackButtonPress]);

    useWebModalFocus({
      childrenIdentity: Children,
      // react-native-web hands host refs the DOM node itself but types them as
      // the React Native component. On a real device this is null-checked
      // `document` away inside the hook and never dereferenced.
      dialogNode: dialogNode as unknown as HTMLElement | null,
      isTopmost,
      onSystemDismiss,
    });

    const isHorizontal =
      config.swipeDirection === "left" || config.swipeDirection === "right";

    const rangeMap = useMemo(
      () =>
        ({
          up: -height,
          down: height,
          left: -width,
          right: width,
        }) satisfies Record<Direction, number>,
      [height, width],
    );

    /**
     * Both swipe surfaces re-push the whole gesture to the native side when
     * this object's identity changes, so it lives in a `useMemo` keyed on
     * everything the worklets close over.
     *
     * The callback names are gesture-handler 2.x's, and `PanGestureSurface`
     * maps them to whichever API the installed major exposes. See
     * `panGesture/pan-gesture-surface.types.ts` for the mapping and for why
     * nothing hangs off `onFinalize`.
     */
    const swipe = useMemo<SwipeGestureSpec>(
      () => ({
        enabled: Boolean(config.swipeDirection),
        minDistance: TOUCH_SLOP,
        onStart: () => {
          "worklet";

          prevTranslationX.value = translationX.value;
          prevTranslationY.value = translationY.value;
        },
        onUpdate: (event) => {
          "worklet";

          const translationValue = isHorizontal
            ? event.translationX
            : event.translationY;

          const prevTranslationValue = isHorizontal
            ? prevTranslationX.value
            : prevTranslationY.value;

          const shouldDampMap = {
            up: translationValue > 0,
            down: translationValue < 0,
            left: translationValue > 0,
            right: translationValue < 0,
          } satisfies Record<Direction, boolean>;

          const shouldDamp =
            shouldDampMap[config.swipeDirection ?? defaultDirection];

          const dampedTranslation = shouldDamp
            ? prevTranslationValue + translationValue * config.dampingFactor
            : prevTranslationValue + translationValue;

          if (isHorizontal) {
            translationX.value = dampedTranslation;
          } else {
            translationY.value = dampedTranslation;
          }
        },
        onEnd: (event) => {
          "worklet";

          const velocityThreshold = config.swipeVelocityThreshold;

          const shouldHideMap = {
            up: event.velocityY < -velocityThreshold,
            down: event.velocityY > velocityThreshold,
            right: event.velocityX > velocityThreshold,
            left: event.velocityX < -velocityThreshold,
          } satisfies Record<Direction, boolean>;

          const shouldHide =
            shouldHideMap[config.swipeDirection ?? defaultDirection];

          if (!shouldHide) {
            translationX.value = withSpring(0, {
              velocity: event.velocityX,
              damping: 75,
            });
            translationY.value = withSpring(0, {
              velocity: event.velocityY,
              damping: 75,
            });
            return;
          }

          const mainTranslation = isHorizontal ? translationX : translationY;
          const mainVelocity = isHorizontal ? event.velocityX : event.velocityY;

          mainTranslation.value = withSpring(
            rangeMap[config.swipeDirection ?? defaultDirection],
            {
              damping: 40,
              overshootClamping: true,
              stiffness: 400,
              velocity: mainVelocity,
            },
            (success) => {
              "worklet";
              if (!success) return;

              // Web used to take the branch below instead. It is off because
              // `Platform.OS` can't be read from inside a worklet; the old
              // wiring is kept commented for whoever picks that back up.
              // if (Platform.OS !== "web") {
              scheduleOnRN(hide, {
                reason: MagicModalHideReason.SWIPE_COMPLETE,
              });
              //   return;
              // }

              // runOnJS(setIsSwipeComplete)(true);

              // // Set immediate is needed so the hide function is called
              // // after "isSwipeComplete" is set to true.
              // runOnJS(setImmediate)(() =>
              //   hide({ reason: MagicModalHideReason.SWIPE_COMPLETE }),
              // );
            },
          );
        },
      }),
      [
        config.dampingFactor,
        config.swipeDirection,
        config.swipeVelocityThreshold,
        hide,
        isHorizontal,
        prevTranslationX,
        prevTranslationY,
        rangeMap,
        translationX,
        translationY,
      ],
    );

    const animatedStyles = useAnimatedStyle(() => {
      "worklet";
      return {
        transform: [
          { translateX: translationX.value },
          { translateY: translationY.value },
        ],
      };
    }, [translationX, translationY]);

    const animatedBackdropStyles = useAnimatedStyle(() => {
      "worklet";
      const translationValue = isHorizontal
        ? translationX.value
        : translationY.value;

      return {
        opacity: interpolate(
          translationValue,
          [rangeMap[config.swipeDirection ?? defaultDirection], 0],
          [0, 1],
          Extrapolation.CLAMP,
        ),
      };
    }, [
      config.swipeDirection,
      isHorizontal,
      rangeMap,
      translationX,
      translationY,
    ]);

    const isBackdropVisible = !config.hideBackdrop;
    const webExitingAnimation = Platform.OS === "web" ? undefined : FadeOut;
    const stackEntryAccessibilityProps =
      getStackEntryAccessibilityProps(isTopmost);
    const dialogAccessibilityProps = getDialogAccessibilityProps({
      accessibilityLabel: config.accessibilityLabel,
      isTopmost,
      onSystemDismiss,
    });

    return (
      <View
        {...stackEntryAccessibilityProps}
        style={[StyleSheet.absoluteFill, styles.pointerEventsBoxNone]}
        testID="magic-modal-stack-entry"
      >
        <Animated.View
          pointerEvents={isBackdropVisible ? "auto" : "none"}
          entering={FadeIn.duration(config.animationInTiming)}
          exiting={webExitingAnimation?.duration(config.animationOutTiming)}
          style={styles.backdropContainer}
        >
          <AnimatedPressable
            accessibilityElementsHidden
            accessible={false}
            aria-hidden
            disabled={!isBackdropVisible}
            importantForAccessibility="no-hide-descendants"
            testID="magic-modal-backdrop"
            style={[
              styles.backdrop,
              animatedBackdropStyles,
              // eslint-disable-next-line react-native/no-inline-styles, react-native/no-color-literals
              {
                backgroundColor: isBackdropVisible
                  ? config.backdropColor
                  : "transparent",
              },
            ]}
            onPress={onBackdropPress}
          />
        </Animated.View>
        <Animated.View
          pointerEvents="box-none"
          style={[styles.overlay, animatedStyles]}
          testID="magic-modal-motion-layer"
        >
          <Animated.View
            pointerEvents="box-none"
            style={[styles.overlay, config.style]}
            testID="magic-modal-animation-layer"
            entering={
              isSwipeComplete
                ? undefined
                : (config.entering ??
                  defaultAnimationInMap[
                    config.swipeDirection ?? defaultDirection
                  ].duration(config.animationInTiming))
            }
            exiting={
              isSwipeComplete || Platform.OS === "web"
                ? undefined
                : (config.exiting ??
                  defaultAnimationOutMap[
                    config.swipeDirection ?? defaultDirection
                  ].duration(config.animationOutTiming))
            }
          >
            <PanGestureSurface swipe={swipe}>
              <View
                {...dialogAccessibilityProps}
                collapsable={false}
                ref={setDialogNode}
                style={[
                  styles.childrenWrapper,
                  config.style,
                  styles.pointerEventsBoxNone,
                ]}
                testID={MODAL_DIALOG_TEST_ID}
              >
                <Children />
              </View>
            </PanGestureSurface>
          </Animated.View>
        </Animated.View>
      </View>
    );
  },
);
