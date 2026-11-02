"use strict";

const current = require("minimatch");

function compatible(api) {
  const match = typeof api === "function" ? api : api.minimatch;
  class Minimatch extends api.Minimatch {
    constructor(pattern, options) {
      super(pattern, options);
      // glob 7 reads _glob and calls String.match on parsed path segments.
      // minimatch 11 returns Matcher objects instead of regular expressions.
      for (const row of this.set) {
        for (const segment of row) {
          if (segment && typeof segment === "object") {
            segment._glob = segment.pattern;
            segment[Symbol.match] = value => segment.test(value) ? [value] : null;
          }
        }
      }
    }

    static defaults(options) {
      return compatible(api.defaults(options)).Minimatch;
    }
  }

  return Object.assign((...args) => match(...args), api, {
    Minimatch,
    defaults: options => compatible(api.defaults(options)),
  });
}

module.exports = compatible(current);
