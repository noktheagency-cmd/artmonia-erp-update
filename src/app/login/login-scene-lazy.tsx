"use client";

import dynamic from "next/dynamic";
import styles from "./login.module.css";

const LoginScene = dynamic(
  () => import("./login-scene").then((module) => module.LoginScene),
  {
    ssr: false,
    loading: () => <div className={styles.scenePlaceholder} aria-hidden="true" />,
  },
);

export function LoginSceneLazy() {
  return (
    <div className={styles.sceneStage}>
      <LoginScene />
    </div>
  );
}
