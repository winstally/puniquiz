"use client";

import { useEffect } from "react";
import { requestMotionPermission } from "@/lib/motion-gravity";

export function MotionGravityPrimer() {
  useEffect(() => {
    const request = () => requestMotionPermission();
    window.addEventListener("pointerdown", request, { passive: true, once: true });
    window.addEventListener("touchend", request, { passive: true, once: true });
    window.addEventListener("click", request, { passive: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", request);
      window.removeEventListener("touchend", request);
      window.removeEventListener("click", request);
    };
  }, []);

  return null;
}
