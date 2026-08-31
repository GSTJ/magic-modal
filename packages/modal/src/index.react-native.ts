import type { ModalProps } from "./constants/types.react-native";
import type { MagicModalAPI } from "./utils/magic-modal-handler";

import { magicModal as magicModalCore } from "./utils/magic-modal-handler";

export { MagicModalPortal } from "./components/MagicModalPortal/magic-modal-portal";
export {
  MagicModalHideReason,
  type HideReturn,
  type ModalChildren,
  type ModalConfigCommon,
  type ModalHandle,
  type Direction,
} from "./constants/types";
export type {
  ModalProps,
  NewConfigProps,
} from "./constants/types.react-native";
export type { MagicModalAPI } from "./utils/magic-modal-handler";
export { useMagicModal } from "./components/magic-modal-provider";

/**
 * The imperative modal API, typed for React Native: `style` is a
 * `StyleProp<ViewStyle>`, and {@link ModalProps.entering} and
 * {@link ModalProps.exiting} take Reanimated builders.
 */
export const magicModal: MagicModalAPI<ModalProps> = magicModalCore;
