/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface AssetFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
  DB: unknown;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

/**
 * Response hardening applied to everything this Worker serves.
 *
 * Strict-Transport-Security is deliberately NOT set. It is the obvious thing to
 * reach for, and here it would backfire: niumpi.com is currently intercepted by
 * an ISP category filter that presents its own untrusted certificate. Under
 * HSTS a browser refuses that connection outright with no click-through
 * (RFC 6797 section 12.1), so pinning the domain would turn a bypassable
 * warning into a hard block for anyone behind such a filter. Add it once the
 * domain is delisted and the TLS path is genuinely clean end to end.
 *
 * No Content-Security-Policy is set here. The app is server-rendered with
 * inline bootstrap script and style, so a policy strict enough to be worth
 * having needs nonce plumbing through the render; a permissive one would only
 * be decoration.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
};

/**
 * Re-wraps a response with the headers above. Anything the upstream already set
 * wins, so this can never clobber a cache directive or content type. A 101
 * websocket upgrade is passed through untouched — its body is immutable.
 */
function harden(response: Response): Response {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return harden(await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths));
    }

    return harden(await handler.fetch(request, env, ctx));
  },
};

export default worker;
