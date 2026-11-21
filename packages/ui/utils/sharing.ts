/** Decode annotations in legacy local drafts. */
import { AnnotationType, type Annotation, type ImageAttachment } from '../types';
// Image in shareable format: plain string (old) or [path, name] tuple (new)
type ShareableImage = string | [string, string];

// Minimal shareable annotation format: [type, originalText, text?, author?, images?, quickLabel?, quickLabelTip?]
export type ShareableAnnotation =
  | ['D', string, string | null, ShareableImage[]?]                    // Deletion: type, original, author, images
  | ['C', string, string, string | null, ShareableImage[]?, (1)?, string?] // Comment: type, original, comment, author, images, isQuickLabel, quickLabelTip (a label's tip; older links end before it)
  | ['G', string, string | null, ShareableImage[]?];                   // Global Comment: type, comment, author, images

export function parseShareableImages(raw: ShareableImage[] | undefined): ImageAttachment[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map(img => {
    if (typeof img === 'string') {
      // Old format: plain path string — derive name from filename
      const name = img.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image';
      return { path: img, name };
    }
    return { path: img[0], name: img[1] };
  });
}

/**
 * Convert shareable format back to full Annotation objects
 * Note: blockId, offsets, and meta will need to be populated separately
 * by finding the text in the rendered document.
 */
export function fromShareable(data: ShareableAnnotation[], diffContexts?: (string | null)[] | null, sources?: (string | undefined)[] | null): Annotation[] {
  const typeMap: Record<string, AnnotationType> = {
    'D': AnnotationType.DELETION,
    'C': AnnotationType.COMMENT,
    'G': AnnotationType.GLOBAL_COMMENT,
  };

  return data.map((item, index) => {
    const type = item[0];

    // Handle global comments specially: ['G', text, author, images?]
    if (type === 'G') {
      const text = item[1] as string;
      const author = item[2] as string | null;
      const rawImages = item[3] as ShareableImage[] | undefined;

      return {
        id: `shared-${index}-${Date.now()}`,
        blockId: '',
        startOffset: 0,
        endOffset: 0,
        type: AnnotationType.GLOBAL_COMMENT,
        text: text || undefined,
        originalText: '',
        createdA: Date.now() + index,
        author: author || undefined,
        images: parseShareableImages(rawImages),
        ...(sources?.[index] ? { source: sources[index] } : {}),
      };
    }

    const originalText = item[1];
    // For deletion: [type, original, author, images?]
    // For others: [type, original, text, author, images?]
    const text = type === 'D' ? undefined : item[2] as string;
    const author = type === 'D' ? item[2] as string | null : item[3] as string | null;
    const rawImages = type === 'D' ? item[3] as ShareableImage[] | undefined : item[4] as ShareableImage[] | undefined;
    // Comment annotations may have isQuickLabel flag at index 5
    const isQuickLabel = type === 'C' && item.length > 5 && item[5] === 1 ? true : undefined;
    // ...and its tip at index 6 (links made before the tip was shared end at 5)
    const quickLabelTip = isQuickLabel && typeof item[6] === 'string' && item[6] ? item[6] : undefined;

    return {
      id: `shared-${index}-${Date.now()}`,
      blockId: '',  // Will be populated during highlight restoration
      startOffset: 0,
      endOffset: 0,
      type: typeMap[type],
      text: text || undefined,
      originalText,
      createdA: Date.now() + index,  // Preserve order
      author: author || undefined,
      images: parseShareableImages(rawImages),
      ...(isQuickLabel ? { isQuickLabel } : {}),
      ...(quickLabelTip ? { quickLabelTip } : {}),
      ...(diffContexts?.[index] ? { diffContext: diffContexts[index] as Annotation['diffContext'] } : {}),
      ...(sources?.[index] ? { source: sources[index] } : {}),
      // startMeta/endMeta will be set by web-highlighter
    };
  });
}
