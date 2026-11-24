/**
 * The review's file-tree builder now lives in @reviewtrail/ui so hosts can embed
 * the same tree (`@reviewtrail/ui/components/DiffFileTree`). This module keeps
 * the review's historical names and binds the node type to the review's
 * DiffFile, so every review call site is unchanged.
 */
import type { DiffFile } from '../types';
import type { DiffFileTreeNode } from '@reviewtrail/ui/utils/diffFileTree';

export {
  buildDiffFileTree as buildFileTree,
  getAncestorPaths,
  getVisualFileOrder,
  getAllFolderPaths,
} from '@reviewtrail/ui/utils/diffFileTree';

export type FileTreeNode = DiffFileTreeNode<DiffFile>;
