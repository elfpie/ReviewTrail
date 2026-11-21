# ReviewTrail shared UI

This private workspace package contains the document rendering, annotations, settings, themes, diagrams and controls used by the review editor. It comes from Plannotator’s reusable UI. ReviewTrail builds its source directly into the reader. The public upstream package and the Workspaces application have separate release processes.

`packages/core` supplies browser-safe parsing and types. `packages/review-editor` composes the review UI. Preserve the existing document renderer and optional host integrations when changing a shared component. Use the [project guide](../../docs/agent-guides/project-and-development.md) for local builds and DOM tests.
