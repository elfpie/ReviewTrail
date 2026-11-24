/**
 * The Bun servers' half of "annotate's live app proxy never fronts a
 * ReviewTrail server" (packages/shared/reviewtrail-server-marker.ts):
 *  - every response carries the ReviewTrail server header, so the probe and
 *    the proxy can tell a ReviewTrail server from a dev app;
 *  - a request the live proxy forwarded (it carries the live proxy header) is
 *    refused before any route, so a write through the proxy never runs here.
 *
 * Usage: `Bun.serve(withReviewTrailServerHeader({ ...options }))`. The
 * options keep their contextual types (the helper returns what it is given)
 * and their methods keep `this`. A WebSocket upgrade (the handler returns
 * nothing) is left alone.
 */

import {
  LIVE_PROXIED_REFUSED_CODE,
  LIVE_PROXIED_REFUSED_MESSAGE,
  REVIEWTRAIL_SERVER_HEADER,
  REVIEWTRAIL_SERVER_HEADER_VALUE,
  isLiveProxiedRequest,
} from "@reviewtrail/shared/reviewtrail-server-marker";

export { REVIEWTRAIL_SERVER_HEADER } from "@reviewtrail/shared/reviewtrail-server-marker";

/** Set the header on a response, copying it when its headers are immutable. */
export function markReviewTrailResponse<T>(response: T): T {
  if (!(response instanceof Response)) return response;
  try {
    response.headers.set(REVIEWTRAIL_SERVER_HEADER, REVIEWTRAIL_SERVER_HEADER_VALUE);
    return response;
  } catch {
    // A fetch() Response has immutable headers: answer with a copy.
    const copy = new Response(response.body, response);
    copy.headers.set(REVIEWTRAIL_SERVER_HEADER, REVIEWTRAIL_SERVER_HEADER_VALUE);
    return copy as T;
  }
}

/** The 403 a request forwarded by the live app proxy gets. */
export function liveProxiedRefusal(): Response {
  return new Response(LIVE_PROXIED_REFUSED_MESSAGE, {
    status: 403,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-ReviewTrail-Error": LIVE_PROXIED_REFUSED_CODE,
      [REVIEWTRAIL_SERVER_HEADER]: REVIEWTRAIL_SERVER_HEADER_VALUE,
    },
  });
}

type Handler = (this: unknown, ...args: unknown[]) => unknown;

function wrapFetch(handler: Handler): Handler {
  return function (this: unknown, ...args: unknown[]) {
    const req = args[0];
    if (req instanceof Request && isLiveProxiedRequest(req.headers)) return liveProxiedRefusal();
    const result = handler.apply(this, args);
    if (result instanceof Promise) return result.then(markReviewTrailResponse);
    return markReviewTrailResponse(result);
  };
}

function wrapError(handler: Handler): Handler {
  return function (this: unknown, ...args: unknown[]) {
    const result = handler.apply(this, args);
    if (result instanceof Promise) return result.then(markReviewTrailResponse);
    return markReviewTrailResponse(result);
  };
}

/** Wrap `fetch` and `error` of Bun.serve options (see the header). */
export function withReviewTrailServerHeader<T extends object>(options: T): T {
  const record = options as Record<string, unknown>;
  if (typeof record.fetch === "function") record.fetch = wrapFetch(record.fetch as Handler);
  if (typeof record.error === "function") record.error = wrapError(record.error as Handler);
  return options;
}
