Private copy of deepmerge 4.3.1 (MIT), from the npm distribution.

GHSA-gcqx-w48m-w2h4 has no published fix. All three writes in mergeObject use Object.defineProperty so an own enumerable __proto__ key cannot invoke the destination prototype setter, including keys copied from the target. Existing array, symbol and custom merge behavior is preserved. The original license is included. Remove this override when upstream publishes a fix.

Run node --test tools/deepmerge-security.test.cjs. The root security check runs this regression test before the unchanged pnpm audit.
