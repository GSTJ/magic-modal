/** @type {import("conventional-changelog-conventionalcommits").CommitType[]} */
export const TYPES = [
  { type: "fix", section: ":hammer: Bug Fixes :hammer:", effect: "bump" },
  { type: "feat", section: ":stars: New Features :stars:", effect: "bump" },
  { type: "feature", section: ":stars: New Features :stars:", effect: "bump" },
  {
    type: "refactor",
    section: ":dash: Code Improvements :dash:",
    effect: "changelog",
  },
  { type: "perf", section: ":dash: Code Improvements :dash:", effect: "bump" },
  { type: "revert", section: ":x: Removed :x:", effect: "bump" },
  {
    type: "chore",
    section: ":curly_loop: What a drag! :curly_loop:",
    effect: "changelog",
  },
  {
    type: "build",
    section: ":package: Build System :package:",
    effect: "changelog",
  },
  {
    type: "docs",
    section: ":books: Documentation :books:",
    effect: "changelog",
  },
  {
    type: "ci",
    section: ":curly_loop: Continuous Integrations :curly_loop:",
    effect: "hidden",
  },
  { type: "style", section: ":lipstick: Styles :lipstick:", effect: "hidden" },
  { type: "test", section: ":link: Testing Updated :link:", effect: "hidden" },
];
