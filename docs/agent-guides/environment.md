# Environment

The public launcher maps `REVIEWTRAIL_` variables into the shared review modules. It defaults to `~/.reviewtrail` and an ephemeral port. `REVIEWTRAIL_DATA_DIR` and `REVIEWTRAIL_PORT` override those defaults. `REVIEWTRAIL_REMOTE=0` selects local mode. `REVIEWTRAIL_GIT_REMOTE_CHECK=0` disables automatic Git remote probes. `REVIEWTRAIL_PACKAGE_LOOKUP=0` disables registry metadata lookup. `REVIEWTRAIL_AI=disabled` allows reading local diffs with AI features off.

Installation accepts `REVIEWTRAIL_BIN_DIR`, `CLAUDE_CONFIG_DIR` and `PI_CODING_AGENT_DIR`. Run the launcher from the repository to review, or supply a path or PR URL. See the [launcher](../../bin/reviewtrail) for inherited operator policy and the [network inventory](../../NETWORK_AUDIT.md) for destinations and triggers.
