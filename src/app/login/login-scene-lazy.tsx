"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const LoginScene = dynamic(
  () => import("./login-scene").then((module) => module.LoginScene),
  { ssr: false },
);

export function LoginSceneLazy() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timeoutId = globalThis.setTimeout(() => setReady(true), 180);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  return (
    <div className="kinetic-scene-stage" data-ready={ready}>
      {ready ? <LoginScene /> : null}
    </div>
  );
}
