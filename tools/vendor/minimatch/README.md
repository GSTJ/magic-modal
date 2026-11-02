Private CommonJS adapter for consumers of minimatch 3 through 8. Uses the patched minimatch 11 matcher and exposes its named exports on the callable entrypoint. Replaces the old minimatch 3 patch, preserving the callable API without retaining the vulnerable matcher.

Legacy glob also reads parsed segments through `_glob` and `String.match`. The compatibility class delegates those operations to minimatch 11 matchers so React Native podspec discovery keeps working. Native and dependency cache keys include the vendored sources.
