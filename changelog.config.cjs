"use strict";

module.exports = {
  options: {
    preset: {
      name: "conventionalcommits",
      types: [
        { type: "feat", section: "Features" },
        { type: "fix", section: "Bug Fixes" },
        { type: "docs", section: "Documentation", hidden: false },
        { type: "perf", hidden: true },
        { type: "refactor", hidden: true },
        { type: "test", hidden: true },
        { type: "build", hidden: true },
        { type: "ci", hidden: true },
        { type: "chore", hidden: true },
        { type: "style", hidden: true },
        { type: "revert", hidden: true },
      ],
    },
  },
};
