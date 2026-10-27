<p align="center">
  <img
    alt="A rating flow moving from magicModal.show to a typed close result"
    src="https://assets.gabrieltaveira.dev/magic-modal/demo.gif"
  />
</p>

<p align="center">Mount one portal. Open a modal from any async flow and await a typed result on Expo, React Native, or the web.</p>

<p align="center">
  <a aria-label="npm version" href="https://www.npmjs.com/package/magic-modal"><img alt="npm version" src="https://shieldcn.dev/npm/magic-modal.svg?variant=branded&amp;size=xs&amp;mode=light" /></a>
  <a aria-label="npm downloads" href="https://www.npmjs.com/package/react-native-magic-modal"><img alt="npm downloads" src="https://shieldcn.dev/npm/react-native-magic-modal/downloads.svg?variant=branded&amp;size=xs&amp;mode=light" /></a>
  <a aria-label="GitHub stars" href="https://github.com/GSTJ/magic-modal/stargazers"><img alt="GitHub stars" src="https://shieldcn.dev/github/GSTJ/magic-modal/stars.svg?variant=branded&amp;size=xs&amp;mode=light" /></a>
  <a aria-label="license" href="https://github.com/GSTJ/magic-modal/blob/main/LICENSE"><img alt="license" src="https://shieldcn.dev/github/GSTJ/magic-modal/license.svg?variant=branded&amp;size=xs&amp;mode=light" /></a>
</p>

<p align="center">
  <a href="https://magic-modal.gabrieltaveira.dev/docs/">Docs</a> | <a href="https://github.com/gstj/magic-modal">GitHub</a> | <a href="https://magic-modal.gabrieltaveira.dev/docs/faq/">FAQ</a> | <a href="https://medium.com/@gabrieltaveira/you-have-been-using-react-native-modals-wrong-9b8c17de2f96">Article</a>
</p>

## How it works

1. `MagicModalPortal` owns the modal stack. Mount it once, near the root.
2. `magicModal.show()` pushes one entry and returns an awaitable handle.
3. `useMagicModal().hide(data)` closes that entry with typed data.
4. The handle resolves to `HideReturn<T>`, including the close reason.

The handle is the promise itself, carrying that entry's `modalID`, `update`, and `hide`. The caller
resumes with submitted data or the exact dismissal reason.

```tsx
const result = await magicModal.show<ConfirmationResult>(ConfirmationModal, {
  accessibilityLabel: "Confirm publish",
});

if (result.reason === MagicModalHideReason.INTENTIONAL_HIDE) {
  await publish(result.data);
} else {
  recordCancellation(result.reason);
}
```

`const { promise, modalID, update } = magicModal.show(...)` still works; `promise` is a deprecated
alias of the handle itself.

Every stack entry keeps its own component, configuration, ID, and promise. A second `show()` call
can open above the current modal without mixing their results.

## Installation

Expo chooses versions compatible with the installed SDK.

### Expo Web

```bash
pnpm add magic-modal
npx expo install react-native-gesture-handler react-native-reanimated react-native-worklets react-dom react-native-web @expo/metro-runtime
```

Expo Web bundles through Metro under the `react-native` condition, so it loads the native entry and
takes the same peers as iOS and Android. The browser-only install is the Next.js one below. Read the
[Expo guide](https://magic-modal.gabrieltaveira.dev/docs/platforms/expo/) for the portal and web
command.

### Expo iOS

```bash
pnpm add magic-modal
npx expo install react-native-gesture-handler react-native-reanimated react-native-worklets react-native-screens
```

### Expo Android

```bash
pnpm add magic-modal
npx expo install react-native-gesture-handler react-native-reanimated react-native-worklets react-native-screens
```

iOS and Android use the same native dependency set. The
[native guide](https://magic-modal.gabrieltaveira.dev/docs/platforms/ios-android/) covers
pods, Android back handling, and iOS overlays.

### Next.js and other browser-only React apps

```bash
pnpm add magic-modal
```

That is the whole install. The web entry ships with zero React Native dependencies, so a browser
application needs no bundler alias and no gesture or animation peer. The native entries use the full
React Native stack, which is why the Expo commands above install more. Copy the Client Component
setup from the [Next.js guide](https://magic-modal.gabrieltaveira.dev/docs/platforms/nextjs/). A
runnable App Router consumer lives in [`examples/next-web`](examples/next-web).

For bare React Native, follow the
[installation guide](https://magic-modal.gabrieltaveira.dev/docs/getting-started/installation/).

## Mount the portal

Expo and native applications mount one portal inside `GestureHandlerRootView`:

```tsx
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MagicModalPortal } from "magic-modal";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <YourApp />
      <MagicModalPortal />
    </GestureHandlerRootView>
  );
}
```

With Expo Router, put the same structure in the root `app/_layout.tsx`.

A browser application mounts `MagicModalPortal` inside a Client Component and nothing else. There is
no `GestureHandlerRootView`, because there is no Gesture Handler in the browser bundle. Copy the
shell from the [web setup](https://magic-modal.gabrieltaveira.dev/docs/platforms/nextjs/).

## Return typed data

Use the same result type in `show<T>()` and `useMagicModal<T>()`:

```tsx
import { Pressable, Text, View } from "react-native";
import { MagicModalHideReason, magicModal, useMagicModal } from "magic-modal";

type ConfirmationResult = {
  confirmed: boolean;
};

function ConfirmationModal() {
  const { hide } = useMagicModal<ConfirmationResult>();

  return (
    <View>
      <Text accessibilityRole="header">Publish this release?</Text>
      <Pressable accessibilityRole="button" onPress={() => hide({ confirmed: true })}>
        <Text>Publish</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => hide({ confirmed: false })}>
        <Text>Cancel</Text>
      </Pressable>
    </View>
  );
}

export async function confirmRelease() {
  const result = await magicModal.show<ConfirmationResult>(ConfirmationModal, {
    accessibilityLabel: "Publish this release",
  });

  if (result.reason !== MagicModalHideReason.INTENTIONAL_HIDE) {
    return { confirmed: false, reason: result.reason };
  }

  return result.data;
}
```

That modal is the React Native one. The browser entry renders DOM, so the same modal on the web is a
`<section>` with `<h2>` and `<button>` and imports nothing from React Native. The result contract is
identical either way.

Backdrop presses, completed swipes, system-dismiss actions, and `hideAll()` resolve the same promise
with distinct reasons. System dismissal includes Android back, web Escape, and the native
accessibility escape action. TypeScript exposes `data` after the caller narrows the result to
`INTENTIONAL_HIDE`.

## Documentation

- [Expo Web, iOS, and Android](https://magic-modal.gabrieltaveira.dev/docs/platforms/expo/)
- [Next.js and web](https://magic-modal.gabrieltaveira.dev/docs/platforms/nextjs/)
- [Modal flows and stacks](https://magic-modal.gabrieltaveira.dev/docs/guides/modal-flows/)
- [Hide results](https://magic-modal.gabrieltaveira.dev/docs/reference/hide-results/)
- [Accessibility](https://magic-modal.gabrieltaveira.dev/docs/guides/accessibility/)
- [Advanced content replacement](https://magic-modal.gabrieltaveira.dev/docs/guides/updating-content/)

The [kitchen-sink Expo app](examples/kitchen-sink) contains runnable native flows. The
[interactive site](https://magic-modal.gabrieltaveira.dev/) runs the package in the
browser.

## FAQ

### Can multiple modals be open?

Yes. Every `show()` call creates an independent stack entry with its own ID, configuration, and
promise.

### Can a modal contain a ScrollView?

Yes. Disable swipe dismissal:

```tsx
magicModal.show(ScrollableModal, {
  swipeDirection: undefined,
});
```

Magic Modal doesn't implement snap points or nested scrolling.

### How do I close a modal from outside its component?

Keep the ID returned by `show()`:

```tsx
const { modalID } = magicModal.show(StatusModal);
magicModal.hide(undefined, { modalID });
```

Inside modal content, use `useMagicModal().hide()`.

### How do I render below a native picker on iOS?

Temporarily call `magicModal.disableFullWindowOverlay()`. Restore it in a `finally` block after the
picker closes. The [native overlay guide](https://magic-modal.gabrieltaveira.dev/docs/guides/native-overlays/)
contains the complete pattern.

## Contributors

[See everyone who has contributed](https://github.com/GSTJ/magic-modal/graphs/contributors)
and read the [contributing guide](CONTRIBUTING.md).

## License

Magic Modal is licensed under the [MIT License](LICENSE).

## More from the author

Made by [Gabriel Taveira](https://www.gabrieltaveira.dev), who also built:

<table>
  <tr>
    <td width="64"><a href="https://curvinha.app/?utm_source=magic-modal&utm_medium=readme"><img src="https://curvinha.app/assets/apple-touch-icon.png" width="48" height="48" alt="Curvinha icon"></a></td>
    <td><a href="https://curvinha.app/?utm_source=magic-modal&utm_medium=readme"><b>Curvinha</b></a>: interior design for iPhone. Show your room and get a 3D proposal with real furniture from Brazilian stores. <a href="https://apps.apple.com/br/app/id6816957870?pt=126480814&ct=magic-modal-readme">App Store</a></td>
  </tr>
  <tr>
    <td width="64"><a href="https://pegada.app/?utm_source=magic-modal&utm_medium=readme"><img src="https://pegada.app/apple-touch-icon.png" width="48" height="48" alt="Pegada icon"></a></td>
    <td><a href="https://pegada.app/?utm_source=magic-modal&utm_medium=readme"><b>Pegada</b></a>: a new friend for your dog, nearby. It runs Magic Modal in production. <a href="https://apps.apple.com/br/app/id6450865592?pt=126480814&ct=magic-modal-readme">App Store</a></td>
  </tr>
</table>
