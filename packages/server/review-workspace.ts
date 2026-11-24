import {
  canStageFiles,
  detectManagedVcs,
  getVcsContext,
  getVcsDiffFingerprint,
  getVcsFileContentsForDiff,
  getVcsFileBytesForDiff,
  listVcsFiles,
  runVcsDiff,
  stageFile,
  unstageFile,
} from "./vcs";
import {
  WorkspaceReviewSession,
  type WorkspaceReviewBuildOptions,
} from "@reviewtrail/shared/review-workspace";

export {
  WorkspaceReviewSession,
  isRepoRelative,
  mapRepoDiffTypeToWorkspaceMode,
  mapWorkspaceModeToRepoDiffType,
  resolveWorkspaceInitialDiffType,
  type WorkspaceDiffType,
  type WorkspaceRepoRuntimeState,
  type WorkspaceReviewPromptContext,
} from "@reviewtrail/shared/review-workspace";

export {
  aggregateWorkspacePatch,
  discoverWorkspaceRepoPaths,
  prefixWorkspacePatchPaths as prefixPatchPaths,
  resolveWorkspaceFilePath,
  type WorkspacePatchAggregate,
} from "@reviewtrail/shared/review-workspace-node";

export type LocalWorkspaceReview = WorkspaceReviewSession;

const workspaceRuntime = {
  async detectVcsType(cwd?: string) {
    return (await detectManagedVcs(cwd))?.id;
  },
  getVcsContext,
  runVcsDiff,
  getVcsFileContentsForDiff,
  getVcsFileBytesForDiff,
  listVcsFiles,
  getVcsDiffFingerprint,
  canStageFiles,
  stageFile,
  unstageFile,
};

export async function buildLocalWorkspaceReview(
  root: string,
  options: WorkspaceReviewBuildOptions = {},
): Promise<WorkspaceReviewSession> {
  return WorkspaceReviewSession.create(workspaceRuntime, root, options);
}
