"use client";

import { useEffect } from "react";
import { requestMotionPermission } from "@/lib/motion-gravity";

export function MotionGravityPrimer() {
  useEffect(() => {
    // iOS only accepts requestPermission() from a COMPLETED gesture — calls
    // from pointerdown reject without ever showing the dialog. Listen on
    // touchend/click, and keep listening (no `once`): requestMotionPermission
    // resets itself when a call is rejected, so later taps can retry.
    const request = () => requestMotionPermission();
    window.addEventListener("touchend", request, { passive: true });
    window.addEventListener("click", request, { passive: true });
    return () => {
      window.removeEventListener("touchend", request);
      window.removeEventListener("click", request);
    };
  }, []);

  return null;
}
