"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { FontLoader, type Font } from "three/addons/loaders/FontLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import styles from "./login.module.css";

const PARTICLE_COUNT = 5200;
const FONT_URL = "/fonts/helvetiker_bold.typeface.json";
const MORPH_DURATION_MS = 900;

type SurfaceSample = {
  colors: Float32Array;
  positions: Float32Array;
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function rangeProgress(value: number, start: number, end: number) {
  return smoothstep((value - start) / (end - start));
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function applyArtmoniaColors(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const blue = new THREE.Color("#172fdc");
  const violet = new THREE.Color("#5d45f0");
  const orange = new THREE.Color("#ff7a32");
  const mixed = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const wave = 0.5 + 0.5 * Math.sin(x * 1.32 + y * 1.75 + z * 2.2);

    if (wave < 0.52) {
      mixed.lerpColors(blue, violet, wave / 0.52);
    } else {
      mixed.lerpColors(violet, orange, (wave - 0.52) / 0.48);
    }

    colors[index * 3] = mixed.r;
    colors[index * 3 + 1] = mixed.g;
    colors[index * 3 + 2] = mixed.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function centerTextLine(
  font: Font,
  text: string,
  targetWidth: number,
  y: number,
) {
  const geometry = new TextGeometry(text, {
    font,
    size: 1,
    depth: 0.28,
    curveSegments: 12,
    bevelEnabled: true,
    bevelThickness: 0.055,
    bevelSize: 0.04,
    bevelSegments: 5,
  });

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) {
    return geometry;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const scale = targetWidth / size.x;
  geometry.scale(scale, scale, 1);
  geometry.computeBoundingBox();
  geometry.boundingBox?.getCenter(size);
  geometry.translate(-size.x, y - size.y, -size.z);

  return geometry;
}

function createWordGeometry(font: Font) {
  const art = centerTextLine(font, "art", 3.5, 0.88);
  const monia = centerTextLine(font, "monia", 6.4, -0.78);
  const geometry = mergeGeometries([art, monia], false);

  art.dispose();
  monia.dispose();

  if (!geometry) {
    throw new Error("Artmonia text geometry could not be merged.");
  }

  applyArtmoniaColors(geometry);
  geometry.computeVertexNormals();
  return geometry;
}

function sampleSurface(
  geometry: THREE.BufferGeometry,
  count: number,
  seed: number,
): SurfaceSample {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
  const sampler = new MeshSurfaceSampler(mesh);
  (sampler as MeshSurfaceSampler & { randomFunction: () => number }).randomFunction =
    createSeededRandom(seed);
  sampler.build();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const position = new THREE.Vector3();
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    sampler.sample(position, undefined, color);
    positions[index * 3] = position.x;
    positions[index * 3 + 1] = position.y;
    positions[index * 3 + 2] = position.z;
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  mesh.material.dispose();
  return { colors, positions };
}

function createPhysicalMaterial() {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    metalness: 0.08,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    sheen: 0.35,
    sheenColor: new THREE.Color("#b6a9ff"),
    transparent: true,
  });
}

const particleVertexShader = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uPointSize;
  uniform float uProgress;
  uniform float uTime;

  attribute vec3 aTarget;
  attribute vec3 aSourceColor;
  attribute vec3 aTargetColor;
  attribute float aSeed;

  varying vec3 vColor;
  varying float vSeed;

  float easeInOut(float value) {
    return value * value * (3.0 - 2.0 * value);
  }

  void main() {
    float progress = easeInOut(clamp(uProgress, 0.0, 1.0));
    float transitionArc = sin(progress * 3.14159265);
    vec3 midpoint = mix(position, aTarget, 0.5);
    vec3 direction = normalize(midpoint + vec3(0.001));
    float phase = aSeed * 18.0 + uTime * 1.35;
    vec3 turbulence = vec3(
      sin(phase + position.y * 1.7),
      cos(phase * 0.83 + position.x * 1.4),
      sin(phase * 0.61 + position.z * 2.0)
    );

    vec3 transformed = mix(position, aTarget, progress);
    transformed += direction * transitionArc * (0.24 + aSeed * 0.28);
    transformed += turbulence * transitionArc * 0.12;

    vec4 modelPosition = modelMatrix * vec4(transformed, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = uPointSize * uPixelRatio * (8.0 / max(2.0, -viewPosition.z));

    vColor = mix(aSourceColor, aTargetColor, progress);
    vSeed = aSeed;
  }
`;

const particleFragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform float uTime;

  varying vec3 vColor;
  varying float vSeed;

  void main() {
    vec2 centered = gl_PointCoord * 2.0 - 1.0;
    float radiusSquared = dot(centered, centered);
    if (radiusSquared > 1.0) discard;

    float sphereDepth = sqrt(1.0 - radiusSquared);
    vec3 normal = normalize(vec3(centered, sphereDepth));
    vec3 lightDirection = normalize(vec3(-0.45, 0.72, 1.0));
    float diffuse = 0.48 + 0.52 * max(dot(normal, lightDirection), 0.0);
    float specular = pow(max(dot(normal, normalize(vec3(-0.25, 0.35, 1.0))), 0.0), 18.0);
    float shimmer = 0.96 + 0.04 * sin(uTime * 2.0 + vSeed * 22.0);
    float edge = smoothstep(1.0, 0.7, radiusSquared);

    vec3 finalColor = vColor * diffuse * shimmer + vec3(specular * 0.7);
    gl_FragColor = vec4(finalColor, uOpacity * edge);
  }
`;

export function LoginScene() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stage = sceneRef.current;
    const canvas = canvasRef.current;

    if (!stage || !canvas) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      stage.dataset.renderer = "fallback";
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const root = new THREE.Group();
    const pointer = new THREE.Vector2();
    const pointerTarget = new THREE.Vector2();
    const timer = new THREE.Timer();
    const canvasHost = canvas.parentElement;
    let animationFrame = 0;
    let progress = 0;
    let targetProgress = 0;
    let transitionFrom = 0;
    let transitionStartedAt = performance.now();
    let disposed = false;
    let knotGeometry: THREE.TorusKnotGeometry | null = null;
    let wordGeometry: THREE.BufferGeometry | null = null;
    let pointGeometry: THREE.BufferGeometry | null = null;
    let knotMaterial: THREE.MeshPhysicalMaterial | null = null;
    let wordMaterial: THREE.MeshPhysicalMaterial | null = null;
    let pointMaterial: THREE.ShaderMaterial | null = null;
    let shadowGeometry: THREE.CircleGeometry | null = null;
    let shadowMaterial: THREE.MeshBasicMaterial | null = null;

    renderer.setClearColor(0xffffff, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    camera.position.set(0, 0.1, 8.6);
    scene.add(root);
    timer.connect(document);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x786ee8, 2.35));
    const keyLight = new THREE.DirectionalLight(0xffffff, 4.8);
    keyLight.position.set(-3.5, 5.5, 6.5);
    scene.add(keyLight);
    const warmLight = new THREE.PointLight(0xff8a43, 18, 16, 2);
    warmLight.position.set(4, -1.5, 4.5);
    scene.add(warmLight);
    const coolLight = new THREE.PointLight(0x594cff, 14, 14, 2);
    coolLight.position.set(-4.5, 0.5, 3.5);
    scene.add(coolLight);

    const resize = () => {
      const bounds = canvasHost?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(bounds.width, bounds.height, false);
      camera.aspect = bounds.width / bounds.height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvasHost ?? stage);
    resize();

    const setMorphTarget = (target: number) => {
      if (targetProgress === target) {
        return;
      }

      transitionFrom = progress;
      targetProgress = target;
      transitionStartedAt = performance.now();
    };

    const activate = () => {
      setMorphTarget(1);
      stage.dataset.active = "true";
    };

    const deactivate = () => {
      setMorphTarget(0);
      pointerTarget.set(0, 0);
      stage.dataset.active = "false";
    };

    const updatePointer = (event: PointerEvent) => {
      const bounds = stage.getBoundingClientRect();
      pointerTarget.set(
        ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
        -((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
      );
      activate();
    };

    const resetWhenPointerLeavesStage = (event: PointerEvent) => {
      const bounds = stage.getBoundingClientRect();
      const isOutside =
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom;

      if (isOutside && stage.dataset.active === "true") {
        deactivate();
      }
    };

    stage.addEventListener("pointerenter", activate);
    stage.addEventListener("pointermove", updatePointer, { passive: true });
    stage.addEventListener("pointerleave", deactivate);
    stage.addEventListener("focus", activate);
    stage.addEventListener("blur", deactivate);
    window.addEventListener("pointermove", resetWhenPointerLeavesStage, { passive: true });

    const render = (timestamp?: number) => {
      if (disposed) {
        return;
      }

      timer.update(timestamp);
      const elapsed = timer.getElapsed();
      if (coarsePointer && !reducedMotion) {
        const cycle = (elapsed % 11.5) / 11.5;
        progress = cycle < 0.5
          ? smoothstep(cycle * 2)
          : smoothstep((1 - cycle) * 2);
      } else if (reducedMotion) {
        progress = targetProgress;
      } else {
        const distance = Math.max(Math.abs(targetProgress - transitionFrom), 0.001);
        const transitionProgress =
          (performance.now() - transitionStartedAt) / (MORPH_DURATION_MS * distance);
        progress = THREE.MathUtils.lerp(
          transitionFrom,
          targetProgress,
          smoothstep(transitionProgress),
        );
      }

      pointer.lerp(pointerTarget, reducedMotion ? 1 : 0.055);
      root.rotation.x = pointer.y * 0.11 + Math.sin(elapsed * 0.38) * 0.025;
      root.rotation.y = pointer.x * 0.16 + Math.sin(elapsed * 0.24) * 0.07;
      root.rotation.z = Math.sin(elapsed * 0.31) * 0.018;
      root.position.y = reducedMotion ? 0 : Math.sin(elapsed * 0.72) * 0.08;

      if (knotMaterial && wordMaterial && pointMaterial) {
        knotMaterial.opacity = 1 - rangeProgress(progress, 0.07, 0.38);
        knotMaterial.depthWrite = progress < 0.2;
        wordMaterial.opacity = rangeProgress(progress, 0.64, 0.96);
        wordMaterial.depthWrite = progress > 0.82;
        pointMaterial.uniforms.uProgress.value = progress;
        pointMaterial.uniforms.uTime.value = elapsed;
        pointMaterial.uniforms.uOpacity.value =
          rangeProgress(progress, 0.02, 0.2) *
          (1 - rangeProgress(progress, 0.82, 0.995));
      }

      stage.dataset.morph = progress > 0.94 ? "word" : progress < 0.06 ? "knot" : "transition";
      stage.dataset.progress = progress.toFixed(3);
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };

    void new FontLoader().loadAsync(FONT_URL).then(
      (font) => {
        if (disposed) {
          return;
        }

        knotGeometry = new THREE.TorusKnotGeometry(1.55, 0.36, 240, 32, 2, 3);
        knotGeometry.rotateX(0.34);
        knotGeometry.rotateZ(-0.18);
        applyArtmoniaColors(knotGeometry);

        wordGeometry = createWordGeometry(font);
        const knotSamples = sampleSurface(knotGeometry, PARTICLE_COUNT, 117);
        const wordSamples = sampleSurface(wordGeometry, PARTICLE_COUNT, 839);
        const seeds = new Float32Array(PARTICLE_COUNT);
        const random = createSeededRandom(421);

        for (let index = 0; index < PARTICLE_COUNT; index += 1) {
          seeds[index] = random();
        }

        pointGeometry = new THREE.BufferGeometry();
        pointGeometry.setAttribute("position", new THREE.BufferAttribute(knotSamples.positions, 3));
        pointGeometry.setAttribute("aTarget", new THREE.BufferAttribute(wordSamples.positions, 3));
        pointGeometry.setAttribute("aSourceColor", new THREE.BufferAttribute(knotSamples.colors, 3));
        pointGeometry.setAttribute("aTargetColor", new THREE.BufferAttribute(wordSamples.colors, 3));
        pointGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

        knotMaterial = createPhysicalMaterial();
        wordMaterial = createPhysicalMaterial();
        pointMaterial = new THREE.ShaderMaterial({
          uniforms: {
            uOpacity: { value: 0 },
            uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
            uPointSize: { value: 6.2 },
            uProgress: { value: 0 },
            uTime: { value: 0 },
          },
          vertexShader: particleVertexShader,
          fragmentShader: particleFragmentShader,
          transparent: true,
          depthWrite: false,
        });

        const knotMesh = new THREE.Mesh(knotGeometry, knotMaterial);
        const wordMesh = new THREE.Mesh(wordGeometry, wordMaterial);
        const morphPoints = new THREE.Points(pointGeometry, pointMaterial);
        root.add(knotMesh, wordMesh, morphPoints);

        shadowGeometry = new THREE.CircleGeometry(1, 64);
        shadowMaterial = new THREE.MeshBasicMaterial({
          color: 0x303c9f,
          transparent: true,
          opacity: 0.095,
          depthWrite: false,
        });
        const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
        shadow.position.set(0, -2.15, -0.45);
        shadow.rotation.x = -Math.PI / 2.25;
        shadow.scale.set(2.65, 0.52, 1);
        scene.add(shadow);

        stage.dataset.renderer = "webgl";
        stage.dataset.loaded = "true";
        timer.reset();
        animationFrame = window.requestAnimationFrame(render);
      },
      () => {
        stage.dataset.renderer = "fallback";
      },
    );

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      stage.removeEventListener("pointerenter", activate);
      stage.removeEventListener("pointermove", updatePointer);
      stage.removeEventListener("pointerleave", deactivate);
      stage.removeEventListener("focus", activate);
      stage.removeEventListener("blur", deactivate);
      window.removeEventListener("pointermove", resetWhenPointerLeavesStage);
      knotGeometry?.dispose();
      wordGeometry?.dispose();
      pointGeometry?.dispose();
      knotMaterial?.dispose();
      wordMaterial?.dispose();
      pointMaterial?.dispose();
      shadowGeometry?.dispose();
      shadowMaterial?.dispose();
      timer.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={sceneRef}
      className={styles.scene}
      tabIndex={0}
      data-active="false"
      data-loaded="false"
      data-morph="knot"
      data-renderer="loading"
      aria-label="3D Artmonia animasiyası. Yazıya çevirmək üçün üzərinə gəlin."
    >
      <span className={styles.orbitPrimary} aria-hidden="true">
        <i />
      </span>
      <span className={styles.orbitSecondary} aria-hidden="true" />
      <span className={`${styles.sphere} ${styles.sphereBlue}`} aria-hidden="true" />
      <span className={`${styles.sphere} ${styles.sphereOrange}`} aria-hidden="true" />
      <span className={`${styles.sphere} ${styles.sphereSoft}`} aria-hidden="true" />
      <div className={styles.sculptureShell}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        <span className={styles.webglFallback} aria-hidden="true">
          <b>art</b>
          <b>monia</b>
        </span>
      </div>
    </div>
  );
}
