# react-native-magic-modal

This package is now called [`magic-modal`](https://www.npmjs.com/package/magic-modal).

Nothing here has stopped working. `react-native-magic-modal` depends on `magic-modal` and
re-exports it, published from the same commit at the same version. Installing either name gets you
the same code and the same updates.

```bash
pnpm add magic-modal
```

```tsx
import { MagicModalPortal, magicModal, useMagicModal } from "magic-modal";
```

## Moving over

Swap the dependency and the import specifier. The exported API is identical — same functions, same
types, same names — so there is nothing else to change.

```diff
-import { magicModal } from "react-native-magic-modal";
+import { magicModal } from "magic-modal";
```

## If you stay

You will see a deprecation notice on install. That is the only difference. This package will keep
tracking releases so existing projects are not forced to move on anyone else's schedule.

## Why the rename

Magic Modal runs on the web, in Next.js, and in React Native from the same API. The old name only
described one of those.

Documentation and source live at [GSTJ/magic-modal](https://github.com/GSTJ/magic-modal).
Full docs: <https://magic-modal.gabrieltaveira.dev/>.

## License

MIT

## More from the author

Made by [Gabriel Taveira](https://www.gabrieltaveira.dev), who also built:

<table>
  <tr>
    <td width="64"><a href="https://curvinha.app/?utm_source=react-native-magic-modal&utm_medium=readme"><img src="https://curvinha.app/assets/apple-touch-icon.png" width="48" height="48" alt="Curvinha icon"></a></td>
    <td><a href="https://curvinha.app/?utm_source=react-native-magic-modal&utm_medium=readme"><b>Curvinha</b></a>: interior design for iPhone. Show your room and get a 3D proposal with real furniture from Brazilian stores. <a href="https://apps.apple.com/br/app/id6816957870?pt=126480814&ct=react-native-magic-modal-readme">App Store</a></td>
  </tr>
  <tr>
    <td width="64"><a href="https://pegada.app/?utm_source=react-native-magic-modal&utm_medium=readme"><img src="https://pegada.app/apple-touch-icon.png" width="48" height="48" alt="Pegada icon"></a></td>
    <td><a href="https://pegada.app/?utm_source=react-native-magic-modal&utm_medium=readme"><b>Pegada</b></a>: a new friend for your dog, nearby. It runs Magic Modal in production. <a href="https://apps.apple.com/br/app/id6450865592?pt=126480814&ct=react-native-magic-modal-readme">App Store</a></td>
  </tr>
</table>
