# ReviewTrail agent guidance

ReviewTrail is a dedicated code-review fork. The Claude Code skill and Pi extension invoke the same local executable and review server.

- Preserve the staged, unstaged, commit, patch-file and pull-request review flows. Keep approval and comment submission under reviewer control.
- Keep the exported guide self-contained. The user shares the downloaded file. Saving, downloading, opening and deleting a guide must never publish it or require hosted viewer assets.
- Keep the fork’s executable, commands, installation paths, data and browser preferences independent of the upstream installation.
- Put cross-host logic in the shared review server. Exercise changes through the real launcher and both applicable host adapters. Reuse the existing document UI. See the [UI guidance](packages/ui/AGENTS.md).
- Build with `bun run build`. Include new Tailwind directories in the app’s CSS sources.
- Sandbox tests under a temporary data directory and home. Preserve the root test preloads. Use the no-browser helper and fake GitHub CLI. Restore globals modified by tests. Use behavior assertions. Verify new agent-facing instructions with a fresh agent in a scratch checkout.
- Run tests that exercise the changed code and inspect the checks that actually ran. Review keyboard shortcuts go through the shortcut registry.
- Never rebase or force-push a shared branch. Keep AI attribution and session links out of commits, release notes and PRs.

## Guides

- [Project and development](docs/agent-guides/project-and-development.md)
- [Code review](docs/agent-guides/code-review.md)
- [Guided review and shared UI](docs/agent-guides/guides-and-shared-ui.md)
- [Server and storage](docs/agent-guides/server-and-storage.md)
- [Environment](docs/agent-guides/environment.md)
