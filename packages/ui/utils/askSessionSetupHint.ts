import type { Origin } from '@reviewtrail/core/agents';
import { isSessionBridgeProvider, type AIProviderOption } from './aiProvider';

export function askSessionSetupHint(
  origin: Origin | null | undefined,
  providers: ReadonlyArray<Pick<AIProviderOption, 'name' | 'sessionBridge'>>,
): string | null {
  if (origin !== 'oh-my-pi') return null;
  if (providers.some(isSessionBridgeProvider)) return null;
  return "This session has no agent bridge. Use the configured provider for Ask AI, or send feedback from the review.";
}
