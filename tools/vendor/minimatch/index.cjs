"use strict";

// Legacy consumers call the module itself; minimatch 11 exposes a named function.
const current = require("minimatch");
module.exports = Object.assign(current.minimatch, current);
