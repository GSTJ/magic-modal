import type { ModalProps } from "./constants/types.browser";
import type { MagicModalAPI } from "./utils/magic-modal-handler";

import { magicModal as magicModalCore } from "./utils/magic-modal-handler";

export { MagicModalPortal } from "./components/MagicModalPortal/magic-modal-portal.browser";
export {
  MagicModalHideReason,
  type HideReturn,
  type ModalChildren,
  type ModalConfigCommon,
  type ModalHandle,
  type Direction,
} from "./constants/types";
export type { ModalProps, NewConfigProps } from "./constants/types.browser";
export type { MagicModalAPI } from "./utils/magic-modal-handler";
export { useMagicModal } from "./components/magic-modal-provider";

/**
 * The imperative modal API.
 *
 * Identical to the React Native entry's, except for the style-typed options in
 * {@link ModalProps}: `style` is `React.CSSProperties` here, and the Reanimated
 * `entering` and `exiting` builders are not accepted at all, because there is
 * no Reanimated in this bundle to build one with.
 */
export const magicModal: MagicModalAPI<ModalProps> = magicModalCore;
