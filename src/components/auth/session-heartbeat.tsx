"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 60_000;

export function SessionHeartbeat() {
  useEffect(() => {
    let active = true;

    async function verifySession() {
      try {
        const response = await fetch("/api/auth/session/heartbeat", {
          method: "POST",
          cache: "no-store",
          headers: { "x-artmonia-session-heartbeat": "1" },
        });
        if (active && response.status === 401) {
          window.location.replace("/login?reason=session-ended");
        }
      } catch {
        // A transient network failure must not interrupt the employee's current work.
      }
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void verifySession();
    }, HEARTBEAT_INTERVAL_MS);
    const verifyWhenVisible = () => {
      if (document.visibilityState === "visible") void verifySession();
    };
    window.addEventListener("focus", verifyWhenVisible);
    document.addEventListener("visibilitychange", verifyWhenVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", verifyWhenVisible);
      document.removeEventListener("visibilitychange", verifyWhenVisible);
    };
  }, []);

  return null;
}
