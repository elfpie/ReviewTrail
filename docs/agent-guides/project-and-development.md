# Project and development

`bin/reviewtrail` launches the Bun server in `apps/review/server`. The Claude skill and Pi command live under `integrations/`. Both invoke the same binary and receive its reviewer decision. A running review loads its browser assets from `apps/review/dist`.

Install with `bun install --frozen-lockfile`. Run `bun run build` to build the review UI, local diagram engine and semantic-diff WASM. Run `bun run install:reviewtrail` to link a source installation and `bun run dev:review` to work on the UI with demo data.

Run `bun test` for unit and integration coverage. Run `DOM_TESTS=1 bun test --isolate $(cat tests/dom-test-list.txt)` for the DOM suites. Keep tests isolated from real accounts, agents, browsers and user data. Tests that need a forge use a fixture or fake CLI. A new Tailwind source directory needs an entry in the consuming stylesheet.
