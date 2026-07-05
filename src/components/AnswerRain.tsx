"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import Matter from "matter-js";
import { attachMotionGravity } from "@/lib/motion-gravity";

// AnswerRain — a modest physics shower of the correct answer's glossy button
// candy. On reveal a couple dozen copies drop from the top and pile up a little
// at the bottom with real 2D physics (matter-js): gravity, bounce, stacking.
//
// Gyro: on a phone the gravity vector follows the device tilt (DeviceOrientation),
// so the pile sloshes toward whichever way you lean. iOS asks for motion
// permission on the first tap; Android/desktop just work (desktop has no sensor →
// gravity stays straight down).
//
// Resize is handled in place (Render.setSize + moving the walls) — the existing
// pile is kept, NOT re-dropped, so changing the window width doesn't replay the
// whole animation. Skipped entirely under prefers-reduced-motion.
export function AnswerRain({
  srcs,
  count,
  delay = 0,
}: {
  /** One or two candy icons to rain. With two, they alternate so the colours mix. */
  srcs: string[];
  count?: number;
  /** Lead (ms) before the first candy drops — lets a static panel read first. */
  delay?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const srcsKey = srcs.join(",");

  useEffect(() => {
    if (reduce) return;
    const textures = srcsKey.split(",").filter(Boolean);
    if (textures.length === 0) return;
    const host = hostRef.current;
    if (!host) return;

    const { Engine, Render, Runner, Bodies, Composite, Body, Events, Sleeping } = Matter;
    const G = 1.6; // gravity magnitude
    const RATIO = Math.min(window.devicePixelRatio || 1, 2);

    let engine: Matter.Engine | null = null;
    let render: Matter.Render | null = null;
    let runner: Matter.Runner | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let floor: Matter.Body | null = null;
    let leftWall: Matter.Body | null = null;
    let rightWall: Matter.Body | null = null;
    let obstacle: Matter.Body | null = null;
    let cardRo: ResizeObserver | null = null;
    let dropStartTimer: number | undefined;
    let dropTimer: number | undefined;
    let detachMotion: (() => void) | null = null;

    // Gyro target gravity (smoothed toward each frame).
    let targetX = 0;
    let targetY = G;

    const wakeAll = () => {
      if (!engine) return;
      const bodies = Composite.allBodies(engine.world);
      for (let i = 0; i < bodies.length; i++) {
        if (!bodies[i].isStatic) Sleeping.set(bodies[i], false);
      }
    };

    const onTick = () => {
      if (!engine) return;
      engine.gravity.x += (targetX - engine.gravity.x) * 0.12;
      engine.gravity.y += (targetY - engine.gravity.y) * 0.12;
    };

    // The answer card is a solid obstacle so the big candies bonk onto it / perch
    // on its shoulders instead of passing through. Measured from the DOM relative
    // to the canvas; rebuilt on resize. offsetWidth/Height (layout size) ignores
    // the card's enter-scale animation, and the rect centre is stable under scale.
    const refreshObstacle = () => {
      if (!engine) return;
      if (obstacle) {
        Composite.remove(engine.world, obstacle);
        obstacle = null;
      }
      const card = document.querySelector<HTMLElement>("[data-answer-card]");
      if (!card) return;
      const hr = host.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      if (w === 0 || h === 0) return;
      const cx = (cr.left + cr.right) / 2 - hr.left;
      const cy = (cr.top + cr.bottom) / 2 - hr.top;
      obstacle = Bodies.rectangle(cx, cy, w, h, {
        isStatic: true,
        chamfer: { radius: 24 }, // match the card's rounded corners
        render: { visible: false },
      });
      Composite.add(engine.world, obstacle);
    };

    const setup = (width: number, height: number) => {
      engine = Engine.create();
      engine.gravity.y = G;
      engine.enableSleeping = true;
      engine.positionIterations = 10; // tighter solve → candies don't sink into each other
      engine.velocityIterations = 8;

      canvas = document.createElement("canvas");
      canvas.style.display = "block";
      render = Render.create({
        canvas,
        engine,
        // showSleeping:false → matter won't dim settled (sleeping) candies to 50%.
        options: { width, height, background: "transparent", wireframes: false, pixelRatio: RATIO, showSleeping: false },
      });
      host.appendChild(canvas);

      // Oversized static bounds so they always cover the frame; only their
      // positions are updated on resize (never their geometry).
      const SPAN = 6000;
      const opt = { isStatic: true, render: { visible: false } };
      floor = Bodies.rectangle(width / 2, height + 40, SPAN, 80, opt);
      leftWall = Bodies.rectangle(-40, height / 2, 80, SPAN, opt);
      rightWall = Bodies.rectangle(width + 40, height / 2, 80, SPAN, opt);
      Composite.add(engine.world, [floor, leftWall, rightWall]);
      refreshObstacle();
      // Re-measure the card obstacle once it finishes laying out (e.g. the dessert
      // image loads and grows the card) so candies never embed in a stale box.
      const cardEl = document.querySelector<HTMLElement>("[data-answer-card]");
      if (cardEl) {
        cardRo = new ResizeObserver(() => {
          refreshObstacle();
          wakeAll();
        });
        cardRo.observe(cardEl);
      }

      const NAT = 256; // source image natural size (square)
      const BASE = 58; // small candies (a 2-colour shower that mixes)

      // A modest shower so the two colours visibly intermix at the bottom.
      const total = count ?? 14;

      Render.run(render);
      runner = Runner.create();
      Runner.run(runner, engine);

      // Drop a couple per tick, alternating the colours so they mix — after an
      // optional lead so a static panel (your pick / correct) reads first.
      let dropped = 0;
      const tick = () => {
        if (dropped >= total) {
          window.clearInterval(dropTimer);
          return;
        }
        for (let k = 0; k < 2 && dropped < total; k++) {
          const texture = textures[dropped % textures.length]; // alternate → mix
          dropped += 1;
          const size = BASE * (0.82 + Math.random() * 0.36); // slight size variety
          const scale = size / NAT;
          const x = width * (0.1 + Math.random() * 0.8); // spread across the width
          // The candy is a rounded SQUARE (~0.74·size) — chamfered rectangle body
          // so candies pack flush (no overlap/float), unlike circles.
          const side = size * 0.74;
          const body = Bodies.rectangle(x, -size - Math.random() * 90, side, side, {
            chamfer: { radius: side * 0.3 },
            restitution: 0.28,
            friction: 0.1,
            frictionStatic: 0.2,
            frictionAir: 0.01,
            sleepThreshold: 22,
            render: { sprite: { texture, xScale: scale, yScale: scale } },
          });
          Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.25);
          Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.6, y: 0 });
          Composite.add(engine!.world, body);
        }
      };
      dropStartTimer = window.setTimeout(() => {
        refreshObstacle(); // re-measure: the card swapped from 溜め → answer
        dropTimer = window.setInterval(tick, 70);
      }, delay);

      Events.on(engine, "beforeUpdate", onTick);
      detachMotion = attachMotionGravity({
        gravity: G,
        onChange: (x, y) => {
          targetX = x;
          targetY = y;
        },
        onWake: wakeAll,
      });
    };

    const resize = (width: number, height: number) => {
      if (!render || !floor || !leftWall || !rightWall) return;
      // Resize the canvas/viewport in place and move the walls — the pile stays.
      Render.setSize(render, width, height);
      Body.setPosition(floor, { x: width / 2, y: height + 40 });
      Body.setPosition(leftWall, { x: -40, y: height / 2 });
      Body.setPosition(rightWall, { x: width + 40, y: height / 2 });
      refreshObstacle(); // the card re-centred — move its collision body too
      wakeAll(); // let the pile re-settle against the moved floor/walls/card
    };

    // Build once when a real size is available; only resize thereafter.
    let lastW = 0;
    let lastH = 0;
    const sync = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;
      if (!engine) {
        lastW = width;
        lastH = height;
        setup(width, height);
      } else if (Math.abs(width - lastW) >= 4 || Math.abs(height - lastH) >= 4) {
        lastW = width;
        lastH = height;
        resize(width, height);
      }
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(host);

    return () => {
      ro.disconnect();
      cardRo?.disconnect();
      window.clearTimeout(dropStartTimer);
      window.clearInterval(dropTimer);
      detachMotion?.();
      if (engine) Events.off(engine, "beforeUpdate", onTick);
      if (render) Render.stop(render);
      if (runner) Runner.stop(runner);
      if (engine) {
        Composite.clear(engine.world, false);
        Engine.clear(engine);
      }
      if (render) render.textures = {};
      canvas?.remove();
    };
  }, [reduce, srcsKey, count, delay]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 2 }}
    />
  );
}
