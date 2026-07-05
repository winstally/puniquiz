"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import type Matter from "matter-js";

// HeroCandyPhysics — the hero's background candy with REAL 2D physics (matter-js,
// the same engine as AnswerRain). The glossy answer buttons drop in from the top
// and pile up on the wave line at the bottom of the hero, instead of drifting on
// a CSS loop. On a phone the pile sloshes with device tilt (DeviceOrientation).
//
// The canvas sits behind the hero content, above the wave divider, and ignores
// pointer events. Skipped under prefers-reduced-motion.
const ANSWERS = ["/answers/0.webp", "/answers/1.webp", "/answers/2.webp", "/answers/3.webp"];
const NAT = 256; // answer PNGs are 256×256
const texturePreload = new Map<string, Promise<void>>();

type CandySpec = {
  texture: string;
  size: number;
};

function shuffle<T>(items: T[]): T[] {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function candyDeck(total: number): CandySpec[] {
  const sizes = [60, 38];
  const base = ANSWERS.flatMap((texture) =>
    sizes.map((size) => ({ texture, size })),
  );
  const deck: CandySpec[] = [];
  while (deck.length < total) deck.push(...base);
  return shuffle(deck.slice(0, total));
}

function preloadTexture(src: string): Promise<void> {
  const cached = texturePreload.get(src);
  if (cached) return cached;
  const load = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
  texturePreload.set(src, load);
  return load;
}

export function HeroCandyPhysics() {
  const hostRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const host = hostRef.current;
    if (!host) return;

    let engine: Matter.Engine | null = null;
    let render: Matter.Render | null = null;
    let runner: Matter.Runner | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let floorSegs: Matter.Body[] = []; // static segments tracing the wave curve
    let leftWall: Matter.Body | null = null;
    let rightWall: Matter.Body | null = null;
    let topPath: SVGPathElement | null = null; // reusable sampler for the wave's top edge
    let dropTimer: number | undefined;
    let detachMotion: (() => void) | null = null;
    let cancelled = false;
    let setupPending = false;

    const G = 1.6;
    const RATIO = Math.min(window.devicePixelRatio || 1, 2);

    let targetX = 0;
    let targetY = G;

    // The wave divider's height. The collision floor follows the divider's top
    // edge in the same coordinate system as the canvas.
    const waveHeight = () => {
      const wave = host.parentElement?.querySelector<HTMLElement>(".hero-wave");
      const h = wave?.getBoundingClientRect().height ?? 0;
      return h > 0 ? h : 64;
    };

    const wakeAll = (Composite: typeof Matter.Composite, Sleeping: typeof Matter.Sleeping) => {
      if (!engine) return;
      for (const b of Composite.allBodies(engine.world)) {
        if (!b.isStatic) Sleeping.set(b, false);
      }
    };

    const onTick = () => {
      if (!engine) return;
      engine.gravity.x += (targetX - engine.gravity.x) * 0.12;
      engine.gravity.y += (targetY - engine.gravity.y) * 0.12;
    };

    // Sample the wave divider's TOP edge into hero/canvas pixel points, so the
    // floor traces the real curve (candies nestle into its troughs, not a flat line).
    const VBW = 1440;
    const VBH = 80; // the wave svg's viewBox (see page.tsx)
    const waveTopPoints = (width: number, height: number): { x: number; y: number }[] | null => {
      const path = host.parentElement?.querySelector<SVGPathElement>(".hero-wave path");
      const d = path?.getAttribute("d");
      if (!d) return null;
      const topD = d.split(/[Ll]/)[0].trim(); // the top curve, before the closing fill
      if (!topPath) topPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      topPath.setAttribute("d", topD);
      let len = 0;
      try {
        len = topPath.getTotalLength();
      } catch {
        return null;
      }
      if (!len) return null;
      const wh = waveHeight();
      const sx = width / VBW;
      const sy = wh / VBH;
      const top = height - wh; // the wave band sits at the bottom of the hero
      const n = Math.max(16, Math.round(width / 36));
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= n; i++) {
        const p = topPath.getPointAtLength((len * i) / n);
        pts.push({ x: p.x * sx, y: top + p.y * sy });
      }
      return pts;
    };

    // The Matter body is smaller than the glossy sprite art. Lowering the body
    // by the sprite overhang makes the visible bottom kiss the wave curve.
    const SPRITE_OVERHANG = 2;
    const THICK = 30;
    const placeBounds = (
      width: number,
      height: number,
      Body: typeof Matter.Body,
      Bodies: typeof Matter.Bodies,
      Composite: typeof Matter.Composite,
    ) => {
      if (!engine) return;
      if (leftWall) Body.setPosition(leftWall, { x: -16, y: height / 2 });
      if (rightWall) Body.setPosition(rightWall, { x: width + 16, y: height / 2 });

      // Rebuild the curved floor from the wave's top edge.
      for (const s of floorSegs) Composite.remove(engine.world, s);
      floorSegs = [];
      const pts = waveTopPoints(width, height);
      if (pts) {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const length = Math.hypot(dx, dy) + 4;
          const angle = Math.atan2(dy, dx);
          // Offset along the segment normal so the collision top is the sampled
          // wave. The extra overhang aligns the visible sprite edge to the wave.
          const normalX = -Math.sin(angle);
          const normalY = Math.cos(angle);
          const cx = (a.x + b.x) / 2 + normalX * (THICK / 2);
          const cy = (a.y + b.y) / 2 + normalY * (THICK / 2) + SPRITE_OVERHANG;
          floorSegs.push(
            Bodies.rectangle(cx, cy, length, THICK, {
              isStatic: true,
              angle,
              friction: 0.08,
              render: { visible: false },
            }),
          );
        }
      } else {
        // Fallback: a flat floor near the wave line if the path can't be sampled.
        const fy = height - waveHeight() * 0.5 + SPRITE_OVERHANG;
        floorSegs.push(Bodies.rectangle(width / 2, fy + 400, 6000, 800, { isStatic: true, render: { visible: false } }));
      }
      Composite.add(engine.world, floorSegs);
    };

    const setup = async (width: number, height: number) => {
      if (setupPending || engine) return;
      setupPending = true;
      const [{ default: Matter }, { attachMotionGravity }] = await Promise.all([
        import("matter-js"),
        import("@/lib/motion-gravity"),
      ]);
      await Promise.all(ANSWERS.map(preloadTexture));
      setupPending = false;
      if (cancelled || !host.isConnected) return;

      const { Engine, Render, Runner, Bodies, Composite, Body, Events, Sleeping } = Matter;
      engine = Engine.create();
      engine.gravity.y = G;
      engine.enableSleeping = false;
      engine.positionIterations = 8;
      engine.velocityIterations = 6;

      canvas = document.createElement("canvas");
      canvas.style.display = "block";
      render = Render.create({
        canvas,
        engine,
        options: { width, height, background: "transparent", wireframes: false, pixelRatio: RATIO, showSleeping: false },
      });
      host.appendChild(canvas);

      const SPAN = 6000;
      const opt = { isStatic: true, render: { visible: false } };
      leftWall = Bodies.rectangle(-16, height / 2, 80, SPAN, opt);
      rightWall = Bodies.rectangle(width + 16, height / 2, 80, SPAN, opt);
      Composite.add(engine.world, [leftWall, rightWall]);
      placeBounds(width, height, Body, Bodies, Composite); // builds the curved wave floor + positions walls

      Render.run(render);
      runner = Runner.create();
      Runner.run(runner, engine);

      // Scale the candy count to the width so phones get a tidy handful and wide
      // screens a fuller scatter, then drop them in one-by-one with a stagger.
      const total = Math.max(8, Math.min(16, Math.round(width / 140)));
      const textures = candyDeck(total);
      let dropped = 0;
      dropTimer = window.setInterval(() => {
        if (!engine || dropped >= total) {
          window.clearInterval(dropTimer);
          return;
        }
        const i = dropped;
        dropped += 1;
        const spec = textures[i];
        const size = spec.size + (Math.random() - 0.5) * 6;
        const scale = size / NAT;
        const side = size * 0.74;
        const x = width * (0.08 + Math.random() * 0.84);
        const body = Bodies.rectangle(x, -size - Math.random() * 120, side, side, {
          chamfer: { radius: side * 0.24, quality: 10 },
          restitution: 0.18,
          friction: 0.035,
          frictionStatic: 0.001,
          frictionAir: 0.018,
          slop: 0.02,
          render: { sprite: { texture: spec.texture, xScale: scale, yScale: scale } },
        });
        Body.setCentre(body, {
          x: (Math.random() - 0.5) * side * 0.06,
          y: (Math.random() - 0.5) * side * 0.06,
        }, true);
        Body.setAngle(body, (Math.random() - 0.5) * 1.1);
        Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.18);
        Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.5, y: 0 });
        Composite.add(engine.world, body);
      }, 160);

      const tick = onTick;
      Events.on(engine, "beforeUpdate", tick);
      detachMotion = attachMotionGravity({
        gravity: G,
        onChange: (x, y) => {
          targetX = x;
          targetY = y;
        },
        onWake: () => wakeAll(Composite, Sleeping),
      });
      cleanupMatter = () => {
        Events.off(engine, "beforeUpdate", tick);
        if (render) Render.stop(render);
        if (runner) Runner.stop(runner);
        if (engine) {
          Composite.clear(engine.world, false);
          Engine.clear(engine);
        }
      };
    };

    let cleanupMatter: (() => void) | null = null;

    const resize = async (width: number, height: number) => {
      if (!render) return;
      const { default: Matter } = await import("matter-js");
      const { Body, Bodies, Composite, Render, Sleeping } = Matter;
      Render.setSize(render, width, height);
      placeBounds(width, height, Body, Bodies, Composite);
      wakeAll(Composite, Sleeping);
    };

    let lastW = 0;
    let lastH = 0;
    const sync = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;
      if (!engine && !setupPending) {
        lastW = width;
        lastH = height;
        void setup(width, height);
      } else if (Math.abs(width - lastW) >= 4 || Math.abs(height - lastH) >= 4) {
        lastW = width;
        lastH = height;
        void resize(width, height);
      }
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(host);

    return () => {
      cancelled = true;
      ro.disconnect();
      window.clearInterval(dropTimer);
      detachMotion?.();
      cleanupMatter?.();
      if (render) render.textures = {};
      canvas?.remove();
    };
  }, [reduce]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 1 }}
    />
  );
}
