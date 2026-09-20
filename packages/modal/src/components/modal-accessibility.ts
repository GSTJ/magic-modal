import type { ModalChildren } from "../constants/types";

import { useEffect } from "react";

/**
 * The dialog semantics and the DOM focus trap, shared by both modal chromes.
 *
 * `useWebModalFocus` is a no-op wherever there is no `document`, which is every
 * native runtime. It lives here rather than in either chrome because the
 * browser chrome and the React Native one both need it: a react-native-web app
 * reaches the DOM through the React Native chrome too.
 *
 * Nothing in this file imports react-native, not even for a type. The browser
 * graph is checked for that, and the React Native chrome's own props are built
 * next door in `nativeModal/modal-accessibility.ts`.
 */

export const MODAL_DIALOG_TEST_ID = "magic-modal-dialog";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const getFocusableElements = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[inert]"),
  );

const focusFirstElement = (dialog: HTMLElement) => {
  const autoFocusTarget = dialog.querySelector<HTMLElement>("[autofocus]");
  const target = autoFocusTarget ?? getFocusableElements(dialog)[0] ?? dialog;

  target.focus();
};

/**
 * The dialog's ARIA attributes, for a chrome that renders DOM elements.
 *
 * Only the topmost entry is a dialog. The ones under it keep their DOM nodes —
 * dropping them would unmount their content — and give up every attribute that
 * would put them in the accessibility tree.
 *
 * `undefined` rather than `false` throughout, because React omits an undefined
 * attribute where `aria-modal={false}` would render `aria-modal="false"` and
 * announce a second, non-modal dialog.
 */
export const getDialogAriaProps = ({
  accessibilityLabel,
  isTopmost,
}: {
  accessibilityLabel: string | undefined;
  isTopmost: boolean;
}) => ({
  "aria-label": isTopmost ? accessibilityLabel : undefined,
  "aria-modal": isTopmost ? true : undefined,
  role: isTopmost ? "dialog" : undefined,
  tabIndex: isTopmost ? -1 : undefined,
});

/** `aria-hidden` for a stack entry: set on every entry below the top one. */
export const getStackEntryAriaHidden = (isTopmost: boolean) =>
  isTopmost ? undefined : true;

export const useWebModalFocus = ({
  childrenIdentity,
  dialogNode,
  isTopmost,
  onSystemDismiss,
}: {
  childrenIdentity: ModalChildren;
  dialogNode: HTMLElement | null;
  isTopmost: boolean;
  onSystemDismiss: () => void;
}) => {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const dialog = dialogNode;
    const focusToRestore =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    return () => {
      if (!focusToRestore) {
        return;
      }

      window.requestAnimationFrame(() => {
        // React Strict Mode replays effects without removing the mounted
        // dialog. That cleanup is not a real dismissal and must not return
        // focus to the opener.
        if (
          dialog &&
          document.contains(dialog) &&
          dialog.getAttribute("aria-modal") === "true"
        ) {
          return;
        }

        if (!document.contains(focusToRestore)) {
          return;
        }

        const activeDialog = document.querySelector<HTMLElement>(
          `[data-testid="${MODAL_DIALOG_TEST_ID}"][aria-modal="true"]`,
        );

        if (
          activeDialog &&
          activeDialog !== dialog &&
          !activeDialog.contains(focusToRestore)
        ) {
          return;
        }

        focusToRestore.focus();
      });
    };
  }, [dialogNode]);

  useEffect(() => {
    if (!isTopmost || typeof document === "undefined") {
      return;
    }

    const dialog = dialogNode;

    if (!dialog) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      if (!dialog.contains(document.activeElement)) {
        focusFirstElement(dialog);
      }
    });

    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) {
        focusFirstElement(dialog);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onSystemDismiss();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements(dialog);

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const [first] = focusable;
      const last = focusable.at(-1);
      const { activeElement } = document;

      if (
        event.shiftKey &&
        (activeElement === first || activeElement === dialog)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === last || !dialog.contains(activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("focusin", keepFocusInside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("focusin", keepFocusInside);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // `childrenIdentity` is never read in the body, but it re-runs the
    // mount-focus scan when the dialog's children change, so a freshly
    // rendered focusable element gets picked up instead of staying wired to
    // whatever was focusable when the dialog first opened.
    // eslint-disable-next-line react/exhaustive-effect-dependencies -- see above
  }, [childrenIdentity, dialogNode, isTopmost, onSystemDismiss]);
};
