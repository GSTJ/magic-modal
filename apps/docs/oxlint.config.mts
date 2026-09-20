import { extendConfig, next } from "magic-oxlint-config";

const config = extendConfig(next, {});

// oxlint 1.79.0 split `react/react-compiler` into 24 category-specific rules
// (oxc-project/oxc#25500) and dropped the old rule name entirely.
// magic-oxlint-config 2.0.6 still ships it, and oxlint >=1.79 refuses to even
// parse a config that references an unknown rule, "off" or not, so the key
// has to be deleted rather than merged over. Remove once the preset migrates
// to the split rules.
delete config.rules?.["react/react-compiler"];

export default config;
