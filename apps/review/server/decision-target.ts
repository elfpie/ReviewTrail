/**
 * What a CLI session is OF, in full, as this process resolved it: the target
 * a host names in every decision message (`HostResultRecord.target`, the
 * OpenCode bridge's JSON records), in the ready file, and in the `sessions/`
 * registry. Taken from the server's own state, never from the words the agent
 * typed: `QUESTIONS.md` can name two different files.
 */

import path from "path";

/** Review: the PR URL, the patch file (absolute), or the reviewed directory (absolute). Undefined for a patch on stdin. */
export function reviewDecisionTarget(input: {
  prUrl?: string;
  patchFile?: string;
  cwd: string;
  invocationCwd: string;
}): string | undefined {
  if (input.prUrl) return input.prUrl;
  if (input.patchFile !== undefined) {
    return input.patchFile === "-" ? undefined : path.resolve(input.invocationCwd, input.patchFile);
  }
  return path.resolve(input.cwd);
}
