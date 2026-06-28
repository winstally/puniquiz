"use client";

// ScrollReveal — fade-up-on-enter, the editorial motion device borrowed from the
// SmartShift landing: each block starts dimmed + nudged down + softly blurred,
// then settles as it scrolls into view (staggered via `delay`). One-shot
// (unobserves after revealing) and reduced-motion aware.

import { useEffect, useRef } from "react";
import { animate } from "motion";

export function ScrollReveal({
  children,
  delay = 0,
  className,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced motion: show immediately, no animation.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.style.opacity = "1";
      return;
    }

    el.style.opacity = "0";
    el.style.transform = "translateY(18px)";
    el.style.filter = "blur(5px)";
    el.style.willChange = "opacity, transform, filter";

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        animate(
          el,
          { opacity: 1, y: 0, filter: "blur(0px)" },
          { duration: 0.6, delay, ease: [0, 0, 0.2, 1] },
        );
        observer.unobserve(el);
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
