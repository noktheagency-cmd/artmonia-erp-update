"use client";

import dynamic from "next/dynamic";

const LoginScene = dynamic(
  () => import("./login-scene").then((module) => module.LoginScene),
  { ssr: false },
);

export function LoginSceneLazy() {
  return <LoginScene />;
}
