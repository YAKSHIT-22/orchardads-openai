"use client";

import { useEffect, useState } from "react";

/**
 * Load Paddle.js once and initialise it.
 *
 * Paddle.js is injected at runtime rather than bundled: it must come from
 * Paddle's own CDN (the CSP allows exactly that origin), and the sandbox and
 * production builds live at different hosts.
 *
 * Returns null until it's ready, so callers can disable the button rather than
 * open a checkout against an uninitialised SDK.
 */
declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void };
      Initialize: (opts: { token: string; eventCallback?: (e: unknown) => void }) => void;
      Checkout: { open: (opts: Record<string, unknown>) => void };
    };
  }
}

const SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

export function usePaddle(onEvent?: (e: unknown) => void) {
  const [paddle, setPaddle] = useState<Window["Paddle"] | null>(null);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) return; // Not configured — the page shows an honest empty state.

    function init() {
      if (!window.Paddle) return;
      // Sandbox unless explicitly production, matching the server default.
      if (process.env.NEXT_PUBLIC_PADDLE_ENV !== "production") {
        window.Paddle.Environment.set("sandbox");
      }
      window.Paddle.Initialize({ token: token!, eventCallback: onEvent });
      setPaddle(window.Paddle);
    }

    if (window.Paddle) return init();

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (existing) {
      existing.addEventListener("load", init);
      return () => existing.removeEventListener("load", init);
    }

    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
    // Deliberately not removed on unmount: Paddle.js is a singleton and
    // re-adding it on every navigation would re-initialise the SDK.
  }, [onEvent]);

  return paddle;
}
