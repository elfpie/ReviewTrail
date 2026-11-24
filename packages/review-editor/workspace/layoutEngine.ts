import { storage } from '@reviewtrail/ui/utils/storage';

export const LAYOUT_ENGINE_KEY = 'reviewtrail-review-layout-engine';

export function usesPaneLayout(): boolean {
  return storage.getItem(LAYOUT_ENGINE_KEY) !== 'dock';
}
