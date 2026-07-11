"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const sparkPositions = [
  ["12%", "26%", "0ms", "#1d70c9"],
  ["20%", "18%", "90ms", "#f3ae20"],
  ["31%", "27%", "180ms", "#6759df"],
  ["42%", "14%", "270ms", "#f08b36"],
  ["55%", "22%", "360ms", "#2974c9"],
  ["68%", "15%", "450ms", "#f1b323"],
  ["78%", "28%", "540ms", "#6a55df"],
  ["88%", "19%", "630ms", "#ef7c3a"],
  ["16%", "47%", "720ms", "#5b54d9"],
  ["84%", "45%", "810ms", "#1b78ce"],
] as const;

const confettiPositions = [
  ["13%", "12%", "-18deg", "#1d70c9"],
  ["23%", "23%", "26deg", "#f4b51e"],
  ["34%", "10%", "-32deg", "#f07a3b"],
  ["45%", "18%", "18deg", "#6854dd"],
  ["57%", "8%", "-12deg", "#1c86d8"],
  ["69%", "19%", "34deg", "#f3b61d"],
  ["78%", "11%", "-27deg", "#f17742"],
  ["89%", "25%", "20deg", "#6754df"],
] as const;

export function VanGoghBonusIllustration({
  progress,
  reachedCount,
  celebrationKey,
  replayToken,
}: {
  progress: number;
  reachedCount: number;
  celebrationKey: string;
  replayToken: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const replayMountedRef = useRef(false);
  const [celebrationCycle, setCelebrationCycle] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [inViewport, setInViewport] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const stage = Math.min(4, Math.max(0, reachedCount));
  const reveal = Math.min(100, Math.max(0, progress));

  const triggerCelebration = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setCelebrationCycle((value) => value + 1);
    setCelebrating(true);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting), { threshold: 0.05 });
    const onVisibilityChange = () => setPageVisible(!document.hidden);
    observer.observe(container);
    document.addEventListener("visibilitychange", onVisibilityChange);
    onVisibilityChange();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!celebrating) return;
    const timeout = window.setTimeout(() => setCelebrating(false), 1650);
    return () => window.clearTimeout(timeout);
  }, [celebrating, celebrationCycle]);

  useEffect(() => {
    if (!celebrationKey || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const seenKey = `artmonia:bonus-celebration:${celebrationKey}`;
    if (window.localStorage.getItem(seenKey)) return;
    window.localStorage.setItem(seenKey, "seen");
    const timeout = window.setTimeout(triggerCelebration, 500);
    return () => window.clearTimeout(timeout);
  }, [celebrationKey, triggerCelebration]);

  useEffect(() => {
    if (!replayMountedRef.current) {
      replayMountedRef.current = true;
      return;
    }
    triggerCelebration();
  }, [replayToken, triggerCelebration]);

  const sceneStyle = {
    "--bonus-reveal": `${reveal}%`,
    "--bonus-stage-strength": `${Math.max(0.18, stage / 4)}`,
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`hr-bonus-illustration stage-${stage}${celebrating ? " is-celebrating" : ""}${!inViewport || !pageVisible ? " is-paused" : ""}`}
      style={sceneStyle}
      aria-hidden="true"
      data-illustration-engine="layered-dom"
      data-stage={stage}
    >
      <div className="hr-bonus-illustration-backdrop">
        <Image
          className="hr-bonus-workshop-image is-muted"
          src="/hr/bonus/van-gogh-workshop.webp"
          alt=""
          fill
          loading="eager"
          sizes="(max-width: 760px) 100vw, 720px"
          draggable={false}
        />
        <div className="hr-bonus-workshop-reveal">
          <Image
            className="hr-bonus-workshop-image"
            src="/hr/bonus/van-gogh-workshop.webp"
            alt=""
            fill
            loading="eager"
            sizes="(max-width: 760px) 100vw, 720px"
            draggable={false}
          />
        </div>
      </div>

      <div className="hr-bonus-color-bloom" />
      <div className="hr-bonus-sun-glow" />
      <div className="hr-bonus-mascot-shadow" />
      <div className="hr-bonus-mascot-anchor" key={`mascot-${celebrationCycle}`}>
        <Image
          className="hr-bonus-mascot-image"
          src="/hr/bonus/van-gogh-mascot.webp"
          alt=""
          width={900}
          height={1086}
          loading="eager"
          sizes="(max-width: 760px) 58vw, 340px"
          draggable={false}
        />
      </div>

      <div className="hr-bonus-paint-ripples"><i /><i /><i /></div>
      <div className="hr-bonus-stage-stars" key={`stars-${celebrationCycle}`}>
        {sparkPositions.map(([left, top, delay, color], index) => (
          <span key={`${left}-${top}`} style={{ left, top, "--spark-delay": delay, "--spark-color": color } as CSSProperties}>{index % 3 === 0 ? "✦" : "★"}</span>
        ))}
      </div>
      <div className="hr-bonus-confetti" key={`confetti-${celebrationCycle}`}>
        {confettiPositions.map(([left, top, rotate, color]) => (
          <i key={`${left}-${top}`} style={{ left, top, "--confetti-rotate": rotate, "--confetti-color": color } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
