"use client";

import { useEffect } from "react";

const CONTAINER_SELECTOR = [
  '[role="tablist"]',
  '[data-slot="tabs-list"]',
  ".crm-view-tabs",
  ".students-tabs",
  ".hr-ops-tabs",
  ".finance-tabs",
  ".section-tabs",
  ".capsule-tabs",
  ".tabs-segmented-container",
  ".marketing-status-tabs",
  ".marketing-view-tabs",
  ".workshop-module-tabs",
  ".workshop-detail-tabs",
  ".workshop-tabs",
  ".firca-tabs",
  ".slide-library-tabs",
  ".hr-bonus-segment",
  ".crm-attention-category-tabs",
].join(",");

type Indicator = {
  kind: "pill" | "line";
  backgroundImage: string;
  backgroundColor: string;
  boxShadow: string;
  borderRadius: string;
  height?: number;
  bottom?: number;
};

function isTransparent(color: string) {
  return !color || color === "transparent" || color === "rgba(0, 0, 0, 0)";
}

function hasFill(style: Pick<CSSStyleDeclaration, "backgroundImage" | "backgroundColor">) {
  return (style.backgroundImage && style.backgroundImage !== "none") || !isTransparent(style.backgroundColor);
}

function tabItems(container: HTMLElement) {
  return [...container.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
}

function isActive(element: HTMLElement) {
  const data = element.getAttribute("data-active");
  if (data === "false") return false;
  if (data !== null) return true;
  if (element.getAttribute("aria-selected") === "true") return true;
  if (element.getAttribute("aria-pressed") === "true") return true;
  const current = element.getAttribute("aria-current");
  if (current === "page" || current === "true") return true;
  return element.classList.contains("is-active");
}

function readIndicator(active: HTMLElement): Indicator | null {
  const style = getComputedStyle(active);
  if (hasFill(style)) {
    return {
      kind: "pill",
      backgroundImage: style.backgroundImage,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      borderRadius: style.borderRadius,
    };
  }

  const after = getComputedStyle(active, "::after");
  const afterHeight = after.display === "none" ? 0 : Number.parseFloat(after.height);
  const afterVisible = after.display !== "none"
    && afterHeight > 0
    && after.opacity !== "0"
    && hasFill(after);
  if (afterVisible) {
    const bottom = after.bottom === "auto" ? 0 : Number.parseFloat(after.bottom);
    return {
      kind: "line",
      height: afterHeight,
      bottom: Number.isFinite(bottom) ? bottom : 0,
      backgroundImage: after.backgroundImage,
      backgroundColor: after.backgroundColor,
      boxShadow: after.boxShadow,
      borderRadius: after.borderRadius,
    };
  }

  const borderWidth = Number.parseFloat(style.borderBottomWidth);
  if (borderWidth > 0 && !isTransparent(style.borderBottomColor)) {
    return {
      kind: "line",
      height: borderWidth,
      bottom: 0,
      backgroundImage: "none",
      backgroundColor: style.borderBottomColor,
      boxShadow: "none",
      borderRadius: "999px",
    };
  }

  return null;
}

function inactiveAreClear(container: HTMLElement, active: HTMLElement) {
  const rest = tabItems(container).filter((item) => item !== active);
  if (!rest.length) return false;
  return rest.every((item) => !hasFill(getComputedStyle(item)));
}

function themeKey() {
  return document.documentElement.className;
}

export function TabGlide() {
  useEffect(() => {
    const hosts = new Map<HTMLElement, { paint: Indicator | null; theme: string; disconnect: () => void }>();
    let scanFrame = 0;

    function measure(container: HTMLElement, active: HTMLElement) {
      const hosted = container.classList.contains("tab-glide-host");
      if (hosted) {
        container.classList.add("is-measuring");
        void active.offsetWidth;
      }
      const indicator = readIndicator(active);
      const usable = indicator?.kind === "line" || (indicator?.kind === "pill" && inactiveAreClear(container, active));
      if (hosted) container.classList.remove("is-measuring");
      return usable ? indicator : null;
    }

    function place(container: HTMLElement, instant = false) {
      const active = tabItems(container).find(isActive);
      if (!active || active.offsetWidth === 0) {
        container.style.setProperty("--tab-glide-o", "0");
        return;
      }

      const record = hosts.get(container);
      if (!record) return;
      if (record.theme !== themeKey() || !record.paint) {
        record.paint = measure(container, active);
        record.theme = themeKey();
      }
      if (!record.paint) {
        container.classList.remove("tab-glide-host", "tab-glide-relative", "is-line", "is-ready");
        return;
      }

      if (getComputedStyle(container).position === "static") {
        container.classList.add("tab-glide-relative");
      }
      container.classList.add("tab-glide-host");
      container.classList.toggle("is-line", record.paint.kind === "line");

      for (const item of tabItems(container)) {
        if (item.dataset.tabGlideTransition === "1") continue;
        item.dataset.tabGlideTransition = "1";
        item.style.transitionProperty = "color, border-color, opacity, transform, filter";
      }

      const paint = record.paint;
      const left = active.offsetLeft;
      const width = active.offsetWidth;
      const top = paint.kind === "line"
        ? active.offsetTop + active.offsetHeight - (paint.height ?? 2) - (paint.bottom ?? 0)
        : active.offsetTop;
      const height = paint.kind === "line" ? paint.height ?? 2 : active.offsetHeight;

      container.style.setProperty("--tab-glide-x", `${left}px`);
      container.style.setProperty("--tab-glide-y", `${top}px`);
      container.style.setProperty("--tab-glide-w", `${width}px`);
      container.style.setProperty("--tab-glide-h", `${height}px`);
      container.style.setProperty("--tab-glide-radius", paint.borderRadius || "0px");
      container.style.setProperty("--tab-glide-bg", paint.backgroundColor || "transparent");
      container.style.setProperty("--tab-glide-image", paint.backgroundImage || "none");
      container.style.setProperty("--tab-glide-shadow", paint.boxShadow || "none");
      container.style.setProperty("--tab-glide-o", "1");

      if (instant || !container.classList.contains("is-ready")) {
        container.classList.remove("is-ready");
        void container.offsetWidth;
        requestAnimationFrame(() => container.classList.add("is-ready"));
      }
    }

    function forget(container: HTMLElement) {
      const record = hosts.get(container);
      if (!record) return;
      record.disconnect();
      hosts.delete(container);
      container.classList.remove("tab-glide-host", "tab-glide-relative", "is-line", "is-ready", "is-measuring");
    }

    function watch(container: HTMLElement) {
      if (hosts.has(container)) return;
      const resize = new ResizeObserver(() => place(container));
      resize.observe(container);
      for (const item of tabItems(container)) resize.observe(item);
      const mutations = new MutationObserver(() => place(container));
      mutations.observe(container, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "data-active", "aria-selected", "aria-pressed", "aria-current"],
      });
      hosts.set(container, {
        paint: null,
        theme: "",
        disconnect: () => {
          resize.disconnect();
          mutations.disconnect();
        },
      });
      place(container, true);
    }

    function scan() {
      hosts.forEach((_record, container) => {
        if (!container.isConnected) forget(container);
      });
      document.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR).forEach((container) => {
        if (container.isConnected) watch(container);
      });
    }

    function requestScan() {
      if (scanFrame) return;
      scanFrame = requestAnimationFrame(() => {
        scanFrame = 0;
        scan();
      });
    }

    scan();
    const added = new MutationObserver(requestScan);
    added.observe(document.body, { childList: true, subtree: true });
    const theme = new MutationObserver(() => {
      hosts.forEach((record, container) => {
        record.paint = null;
        record.theme = "";
        place(container);
      });
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      if (scanFrame) cancelAnimationFrame(scanFrame);
      added.disconnect();
      theme.disconnect();
      hosts.forEach((record) => record.disconnect());
      hosts.forEach((_record, container) => {
        container.classList.remove("tab-glide-host", "tab-glide-relative", "is-line", "is-ready", "is-measuring");
        container.style.removeProperty("--tab-glide-x");
        container.style.removeProperty("--tab-glide-y");
        container.style.removeProperty("--tab-glide-w");
        container.style.removeProperty("--tab-glide-h");
        container.style.removeProperty("--tab-glide-radius");
        container.style.removeProperty("--tab-glide-bg");
        container.style.removeProperty("--tab-glide-image");
        container.style.removeProperty("--tab-glide-shadow");
        container.style.removeProperty("--tab-glide-o");
        tabItems(container).forEach((item) => {
          if (item.dataset.tabGlideTransition !== "1") return;
          delete item.dataset.tabGlideTransition;
          item.style.removeProperty("transition-property");
        });
      });
      hosts.clear();
    };
  }, []);

  return null;
}
