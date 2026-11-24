# Working on `@reviewtrail/ui`

This private workspace retains the upstream document UI components used by ReviewTrail. See [README.md](README.md) for its role in the fork.

**The rules when editing here:**

- **Do not reimplement the document UI from scratch.** A prior from-scratch rewrite broke the app and was reverted.
- To support a host's different backend, **add an optional seam** (a module-level `setX`/`resetX` default, or an optional prop) whose default reproduces today's behavior. ReviewTrail passes nothing and stays **byte-for-byte unchanged**.
- `@reviewtrail/core` is browser-safe and zero-dep — **no `node:` imports** (CI enforces it). `@reviewtrail/shared`/`@reviewtrail/ai` stay private; `shared` re-exports `core` via shims.
- **Never delete working ReviewTrail code until a human confirms parity in the browser.**
