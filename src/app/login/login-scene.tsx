"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const artworkLetters = [..."ARTMONIA"];

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uMobile;
  uniform float uHover;
  uniform vec2 uResolution;
  uniform vec2 uPointer;

  varying vec2 vUv;

  #define PI 3.14159265359

  mat2 rotate2d(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
  }

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float smoothMin(float a, float b, float amount) {
    float h = clamp(0.5 + 0.5 * (b - a) / amount, 0.0, 1.0);
    return mix(b, a, h) - amount * h * (1.0 - h);
  }

  float torus(vec3 point, vec2 radius) {
    vec2 ring = vec2(length(point.xz) - radius.x, point.y);
    return length(ring) - radius.y;
  }

  float sculpture(vec3 point) {
    float phase = uTime * 0.62;
    vec3 p = point;

    p.x += mix(0.78, 0.0, uMobile);
    p.y -= mix(0.03, 0.72, uMobile);
    p.xz *= rotate2d(phase * 0.24 + uPointer.x * 0.18);
    p.yz *= rotate2d(-phase * 0.17 + uPointer.y * 0.12);

    float bloom = 0.5 + 0.5 * sin(phase * 1.05);
    p.y += (0.18 + uHover * 0.06) * sin(p.x * 2.7 + phase * 2.0);
    p.z += (0.16 + uHover * 0.04) * sin(p.y * 3.2 - phase * 1.55);

    vec3 ribbonA = p;
    ribbonA.xy *= rotate2d(0.66 + 0.22 * sin(phase));
    ribbonA.yz *= rotate2d(0.42 + phase * 0.18);
    float a = torus(ribbonA, vec2(0.92 + bloom * 0.08, 0.115 + bloom * 0.055));

    vec3 ribbonB = p;
    ribbonB.xz *= rotate2d(-0.78 + phase * 0.2);
    ribbonB.xy *= rotate2d(-0.58 - 0.16 * cos(phase * 0.8));
    float b = torus(ribbonB, vec2(0.72 + (1.0 - bloom) * 0.12, 0.105 + bloom * 0.04));

    vec3 ribbonC = p;
    ribbonC.yz *= rotate2d(1.12 - phase * 0.14);
    ribbonC.xy *= rotate2d(0.38 + 0.2 * sin(phase * 0.6));
    float c = torus(ribbonC, vec2(0.54 + bloom * 0.16, 0.085 + (1.0 - bloom) * 0.05));

    float form = smoothMin(a, b, 0.19 + bloom * 0.08);
    form = smoothMin(form, c, 0.15);

    float pulse = sin(p.x * 5.2 - p.y * 3.8 + p.z * 4.1 + phase * 3.0);
    return form + pulse * 0.018;
  }

  vec3 normalAt(vec3 point) {
    vec2 offset = vec2(0.0022, 0.0);
    return normalize(vec3(
      sculpture(point + offset.xyy) - sculpture(point - offset.xyy),
      sculpture(point + offset.yxy) - sculpture(point - offset.yxy),
      sculpture(point + offset.yyx) - sculpture(point - offset.yyx)
    ));
  }

  vec3 artworkColor(vec3 point, vec3 normal, vec3 rayDirection) {
    vec3 cobalt = vec3(0.055, 0.16, 1.0);
    vec3 violet = vec3(0.48, 0.08, 1.0);
    vec3 amber = vec3(1.0, 0.20, 0.015);
    vec3 pearl = vec3(1.0, 0.88, 0.82);

    float flow = sin(point.y * 5.1 - point.x * 3.3 + point.z * 2.2 + uTime * 1.35);
    float filament = smoothstep(0.42, 0.98, sin(point.x * 8.0 + point.y * 5.0 - uTime * 2.1));
    float pearlBand = smoothstep(0.62, 0.98, cos(point.z * 7.0 - point.y * 2.8 + uTime));

    vec3 base = mix(cobalt, violet, 0.24 + 0.2 * sin(point.z * 2.5 + uTime * 0.45));
    base = mix(base, amber, smoothstep(0.24, 0.92, flow));
    base = mix(base, pearl, pearlBand * 0.28);
    base += filament * vec3(0.28, 0.11, 0.02);

    vec3 keyLight = normalize(vec3(-0.75, 0.9, 1.15));
    vec3 rimLight = normalize(vec3(0.9, -0.2, 0.7));
    float diffuse = max(dot(normal, keyLight), 0.0);
    float rim = pow(1.0 - max(dot(normal, -rayDirection), 0.0), 2.25);
    float hotRim = pow(max(dot(normal, rimLight), 0.0), 4.0);
    vec3 reflected = reflect(rayDirection, normal);
    float specular = pow(max(dot(reflected, keyLight), 0.0), 34.0);

    return base * (0.22 + diffuse * 0.86 + uHover * 0.12)
      + rim * mix(cobalt, pearl, 0.3) * 1.18
      + hotRim * amber * 0.7
      + specular * pearl * 1.5;
  }

  void main() {
    vec2 screen = vUv * 2.0 - 1.0;
    screen.x *= uResolution.x / max(uResolution.y, 1.0);

    vec2 pointer = uPointer * vec2(0.16, 0.10);
    vec3 rayOrigin = vec3(pointer.x, pointer.y, 4.45);
    vec3 rayDirection = normalize(vec3(screen - pointer * 0.42, -2.18));

    vec3 backgroundTop = vec3(0.018, 0.012, 0.035);
    vec3 backgroundBottom = vec3(0.055, 0.018, 0.075);
    vec3 color = mix(backgroundBottom, backgroundTop, smoothstep(-1.0, 0.85, screen.y));

    float vignette = 1.0 - smoothstep(0.45, 1.75, length(screen * vec2(0.72, 0.92)));
    color *= 0.64 + vignette * 0.52;

    vec2 galaxyPoint = screen - vec2(mix(-0.2, 0.0, uMobile), mix(0.0, 0.36, uMobile));
    galaxyPoint.x *= 0.78;
    float galaxyRadius = length(galaxyPoint);
    float galaxyAngle = atan(galaxyPoint.y, galaxyPoint.x);
    float galaxyArms = pow(max(0.0, cos(galaxyAngle * 2.7 - log(galaxyRadius + 0.08) * 7.2 - uTime * 0.08)), 10.0);
    float galaxyFade = smoothstep(1.28, 0.08, galaxyRadius) * smoothstep(0.05, 0.24, galaxyRadius);
    color += galaxyArms * galaxyFade * mix(vec3(0.03, 0.1, 0.56), vec3(0.38, 0.05, 0.68), 0.52) * 0.55;
    color += exp(-galaxyRadius * 10.0) * vec3(0.16, 0.09, 0.52) * 0.58;

    vec2 starGrid = gl_FragCoord.xy / 22.0;
    vec2 starCell = floor(starGrid);
    vec2 starPoint = fract(starGrid);
    float starSeed = hash21(starCell);
    vec2 starCenter = vec2(hash21(starCell + 1.7), hash21(starCell + 8.3));
    float starShape = 1.0 - smoothstep(0.025, 0.13, length(starPoint - starCenter));
    float star = step(0.955, starSeed) * starShape * (0.35 + 0.65 * sin(uTime * 1.8 + starSeed * 18.0));
    color += max(star, 0.0) * mix(vec3(0.12, 0.24, 1.0), vec3(1.0, 0.28, 0.03), starSeed) * (1.35 + uHover * 0.24);

    vec2 orbitPoint = screen - vec2(mix(-0.72, 0.0, uMobile), mix(-0.02, 0.55, uMobile));
    float orbit = abs(length(orbitPoint * vec2(0.72, 1.0)) - 0.78);
    float orbitLight = exp(-115.0 * orbit) * (0.48 + 0.52 * sin(atan(orbitPoint.y, orbitPoint.x) * 4.0 - uTime));
    color += max(orbitLight, 0.0) * vec3(0.25, 0.08, 0.72) * 0.42;

    float distanceTravelled = 0.0;
    float glow = 0.0;
    bool hit = false;

    for (int stepIndex = 0; stepIndex < 68; stepIndex++) {
      vec3 point = rayOrigin + rayDirection * distanceTravelled;
      float distanceToForm = sculpture(point);
      glow += 0.0022 / (0.035 + abs(distanceToForm));

      if (distanceToForm < 0.0016) {
        hit = true;
        break;
      }

      distanceTravelled += max(distanceToForm * 0.68, 0.008);
      if (distanceTravelled > 8.5) {
        break;
      }
    }

    color += glow * mix(vec3(0.03, 0.08, 0.8), vec3(1.0, 0.15, 0.01), 0.5 + 0.5 * sin(uTime * 0.5)) * (0.055 + uHover * 0.022);

    if (hit) {
      vec3 point = rayOrigin + rayDirection * distanceTravelled;
      vec3 normal = normalAt(point);
      vec3 surface = artworkColor(point, normal, rayDirection);
      float fog = smoothstep(3.0, 7.8, distanceTravelled);
      color = mix(surface, color, fog);
    }

    color = color / (color + vec3(0.78));
    color = pow(color, vec3(0.82));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function LoginScene() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = sceneRef.current;
    if (!container) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointerTarget = new THREE.Vector2();
    const pointerCurrent = new THREE.Vector2();
    const resolution = new THREE.Vector2(1, 1);
    let hoverTarget = 0;
    let artworkActive = false;

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: false,
        powerPreference: "high-performance",
      });
    } catch {
      container.dataset.motion = "fallback";
      return;
    }

    renderer.domElement.className = "kinetic-scene-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.setClearColor(0x07050b, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    container.dataset.motion = reduceMotion ? "reduced" : "live";

    const uniforms = {
      uTime: { value: reduceMotion ? 5.4 : 0 },
      uMobile: { value: 0 },
      uHover: { value: 0 },
      uResolution: { value: resolution },
      uPointer: { value: pointerCurrent },
    };

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader,
      uniforms,
      vertexShader,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const startedAt = performance.now();

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      const mobile = width <= 760;
      const pixelRatio = Math.min(window.devicePixelRatio, mobile ? 1 : 1.5);

      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      renderer.getDrawingBufferSize(resolution);
      uniforms.uMobile.value = mobile ? 1 : 0;
    };

    const setArtworkState = (nextActive: boolean) => {
      if (artworkActive === nextActive) {
        return;
      }

      artworkActive = nextActive;
      hoverTarget = nextActive ? 1 : 0;
      container.dataset.artworkActive = String(nextActive);
    };

    const onPointerMove = (event: PointerEvent) => {
      const x = event.clientX / window.innerWidth;
      const y = event.clientY / window.innerHeight;
      const mobile = window.innerWidth <= 760;
      const centerX = mobile ? 0.5 : 0.3;
      const centerY = mobile ? 0.32 : 0.5;
      const radiusX = mobile ? 0.47 : 0.27;
      const radiusY = mobile ? 0.26 : 0.38;
      const insideArtwork = ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 < 1;

      pointerTarget.set(x * 2 - 1, -(y * 2 - 1));
      setArtworkState(insideArtwork);
    };

    const resetPointer = () => {
      pointerTarget.set(0, 0);
      setArtworkState(false);
    };

    const render = (timestamp: number) => {
      pointerCurrent.lerp(pointerTarget, 0.045);
      uniforms.uHover.value += (hoverTarget - uniforms.uHover.value) * 0.065;
      if (!reduceMotion) {
        uniforms.uTime.value = (timestamp - startedAt) / 1000;
      }
      renderer.render(scene, camera);
    };

    const onVisibilityChange = () => {
      renderer.setAnimationLoop(document.hidden || reduceMotion ? null : render);
      if (!document.hidden && reduceMotion) {
        render(performance.now());
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    if (reduceMotion) {
      render(performance.now());
    } else {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("mouseleave", resetPointer);
      document.addEventListener("visibilitychange", onVisibilityChange);
      renderer.setAnimationLoop(render);
    }

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("mouseleave", resetPointer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div ref={sceneRef} className="kinetic-scene" aria-hidden="true">
      <div className="kinetic-artwork-word" data-word="ARTMONIA">
        {artworkLetters.map((letter, index) => (
          <span key={`${letter}-${index}`} style={{ "--letter-index": index } as React.CSSProperties}>
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}
