/**
 * The browser chrome's layout, as static CSS.
 *
 * This replaces `StyleSheet.create` and react-native-web's style pipeline. That
 * pipeline — the StyleSheet compiler, styleq, inline-style-prefixer,
 * normalize-colors and the React Native-to-DOM prop translation around them —
 * was over half of what a web app downloaded for this library, to produce a
 * handful of rules that never change.
 *
 * The rules are a faithful copy of what react-native-web compiled the old
 * `StyleSheet` to, including the parts of its `View` reset that a page's own
 * CSS could otherwise break: a consumer with `div { padding: 8px }` used to get
 * the same layout as everyone else and still has to.
 *
 * `MODAL_STYLESHEET` is a constant string rendered inside a `<style>` element
 * by the portal, not injected into `document.head`. Nothing here touches the
 * DOM at module scope, so a Next.js server component can import this file, and
 * the CSS is already in the server-rendered HTML — there is no frame where the
 * modal is unstyled.
 */

export const MODAL_CLASS = {
  /** The portal's own box: one per application, around the whole stack. */
  portal: "magic-modal-portal",
  /** The full-bleed, click-through wrapper around one stack entry. */
  entry: "magic-modal-entry",
  /** The layer that fades, and that owns the backdrop's press target. */
  backdropLayer: "magic-modal-backdrop-layer",
  backdrop: "magic-modal-backdrop",
  /** Motion, content and dialog layers: `flex: 1`, vertically centred. */
  layer: "magic-modal-layer",
  /** `pointerEvents: "box-none"`: transparent to presses, children are not. */
  boxNone: "magic-modal-box-none",
  /** `pointerEvents: "none"`: transparent to presses, children included. */
  none: "magic-modal-none",
} as const;

/**
 * react-native-web's `View` reset, minus the parts nothing here relies on.
 *
 * `box-sizing`, the zeroed box and `position: relative` are the ones that
 * matter: they are what make a `View` behave the same inside any page.
 */
const VIEW_RESET = `align-items: stretch;
  border: 0 solid;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  margin: 0;
  min-height: 0;
  min-width: 0;
  padding: 0;
  position: relative;
  z-index: 0;`;

/**
 * `pointer-events` carries `!important` because react-native-web's compiler
 * emitted it that way, and the modal depends on the result: the layers between
 * the backdrop and the content have to stay transparent to presses even when a
 * consumer's own CSS has an opinion about `pointer-events` on a descendant.
 */
export const MODAL_STYLESHEET = `.${MODAL_CLASS.portal},
.${MODAL_CLASS.entry},
.${MODAL_CLASS.backdropLayer},
.${MODAL_CLASS.backdrop},
.${MODAL_CLASS.layer} {
  ${VIEW_RESET}
}

.${MODAL_CLASS.portal},
.${MODAL_CLASS.entry},
.${MODAL_CLASS.backdropLayer} {
  inset: 0;
  position: absolute;
}

.${MODAL_CLASS.backdrop},
.${MODAL_CLASS.layer} {
  flex: 1 1 0%;
}

.${MODAL_CLASS.layer} {
  justify-content: center;
}

.${MODAL_CLASS.boxNone},
.${MODAL_CLASS.none},
.${MODAL_CLASS.none} * {
  pointer-events: none !important;
}

.${MODAL_CLASS.boxNone} > * {
  pointer-events: auto;
}

`;

/** Joins class names, skipping the ones a conditional turned off. */
export const classes = (...names: (string | false | undefined)[]) =>
  names.filter(Boolean).join(" ");
