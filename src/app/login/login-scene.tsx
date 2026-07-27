"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

export function LoginScene() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let frameId = 0;
    let pointerX = 0;
    let pointerY = 0;

    const renderPointer = () => {
      scene.style.setProperty("--pointer-x", pointerX.toFixed(3));
      scene.style.setProperty("--pointer-y", pointerY.toFixed(3));
      frameId = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;

      if (!frameId) {
        frameId = window.requestAnimationFrame(renderPointer);
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return (
    <div ref={sceneRef} className="kinetic-scene kinetic-scene-image" aria-hidden="true">
      <span className="kinetic-orbit">
        <i />
      </span>
      <div className="kinetic-sculpture-shell">
        <Image
          className="kinetic-sculpture-image"
          src="/login-sculpture-light.png"
          alt=""
          width={1536}
          height={1024}
          sizes="(max-width: 760px) 92vw, 52vw"
          priority
        />
      </div>
    </div>
  );
}
