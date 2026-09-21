import { extendConfig, reactNative } from "magic-oxlint-config";

// `extendConfig` flattens the preset and this object into a single config
// instead of going through oxlint's `extends`, which drops `ignorePatterns`.
// oxlint has no per-override ignore, so nothing in the preset can carry them
// across — which is why magic-oxlint-config 1.2.0 stopped documenting `extends`
// as a way to consume it. Flattening leaves nothing to re-declare by hand.
//
// Don't reach for `oxlint --print-config` to check this: it renders an
// `extends`-shaped config post-expansion and pre-merge, so what it prints is
// not what runs.
const config = extendConfig(reactNative, {
  overrides: [
    {
      // tools/ holds the changelog preset and its control script. Printing to
      // the terminal is what the control is for — the CI job reads its output.
      files: ["tools/**"],
      rules: { "no-console": "off" },
    },
    {
      // release-it only looks for this exact filename, so it misses the
      // preset's `*.config.{js,…}` glob even though it is a config file.
      files: [".release-it.js"],
      rules: {
        // `export default { … }` is the whole file.
        "import/no-anonymous-default-export": "off",
        // `${version}` and `${branchName}` are release-it's own placeholders,
        // interpolated by release-it. Real template literals would be expanded
        // at config load, before there is a version to interpolate.
        "no-template-curly-in-string": "off",
      },
    },
  ],
});

export default config;
