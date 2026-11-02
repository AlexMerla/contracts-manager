"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

// First CAPTCHA integration in this codebase (public-precontract Q3).
// Deliberately NO vendor SDK/npm package — Cloudflare's own `api.js` with
// `render=explicit` is loaded via `next/script` and rendered into a plain
// container, same "thin wrapper, no dependency" spirit as @/lib/turnstile.
//
// No CSP is configured in next.config.ts, so nothing needs allowlisting for
// `challenges.cloudflare.com`.
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          language?: string;
        }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string) => void;
}

export function TurnstileWidget({ siteKey, onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!scriptReady || !containerRef.current || !window.turnstile) {
      return;
    }

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onToken,
      // Both "expired" and "error" clear the token rather than leaving a
      // stale one the confirm button would otherwise still accept client
      // side — the server re-verifies regardless, but this keeps the UI
      // honest about whether a fresh check is needed.
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
      language: "es",
    });
    widgetIdRef.current = widgetId;

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // `onToken` is a stable state setter from the parent wizard;
    // re-rendering the widget on every parent render would reset an
    // already-solved challenge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady, siteKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} data-slot="turnstile-widget" />
    </>
  );
}
