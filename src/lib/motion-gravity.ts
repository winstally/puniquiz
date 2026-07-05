"use client";

type MotionGravityOptions = {
  gravity: number;
  strength?: number;
  onChange: (x: number, y: number) => void;
  onWake?: () => void;
};

type PermissionCapable<T> = T & {
  requestPermission?: () => Promise<string>;
};

const RAD = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function attachMotionGravity({
  gravity,
  strength = 1.45,
  onChange,
  onWake,
}: MotionGravityOptions): () => void {
  let lastX = 0;
  let lastY = gravity;
  let lastOrientationAt = 0;
  let permissionRequested = false;

  const setGravity = (x: number, y: number) => {
    if (Math.abs(x - lastX) < 0.04 && Math.abs(y - lastY) < 0.04) return;
    lastX = x;
    lastY = y;
    onChange(x, y);
    onWake?.();
  };

  const onOrientation = (event: DeviceOrientationEvent) => {
    if (event.beta == null && event.gamma == null) return;
    lastOrientationAt = Date.now();

    const beta = clamp(event.beta ?? 90, 15, 165);
    const gamma = clamp(event.gamma ?? 0, -65, 65);
    const x = gravity * strength * Math.sin(gamma * RAD);
    const y = gravity * Math.max(0.35, Math.sin(beta * RAD));
    setGravity(x, y);
  };

  const onMotion = (event: DeviceMotionEvent) => {
    if (Date.now() - lastOrientationAt < 500) return;
    const acc = event.accelerationIncludingGravity;
    if (!acc?.x) return;

    const x = gravity * strength * clamp(acc.x / 9.81, -1, 1);
    setGravity(x, gravity);
  };

  const requestMotionPermission = () => {
    if (permissionRequested) return;
    permissionRequested = true;

    const DeviceOrientation = window.DeviceOrientationEvent as
      | PermissionCapable<typeof DeviceOrientationEvent>
      | undefined;
    const DeviceMotion = window.DeviceMotionEvent as
      | PermissionCapable<typeof DeviceMotionEvent>
      | undefined;
    const requests: Promise<string>[] = [];

    if (typeof DeviceOrientation?.requestPermission === "function") {
      requests.push(DeviceOrientation.requestPermission());
    }
    if (typeof DeviceMotion?.requestPermission === "function") {
      requests.push(DeviceMotion.requestPermission());
    }

    if (requests.length === 0) return;
    void Promise.allSettled(requests).then(() => onWake?.());
  };

  window.addEventListener("deviceorientation", onOrientation);
  window.addEventListener("deviceorientationabsolute", onOrientation as EventListener);
  window.addEventListener("devicemotion", onMotion);
  window.addEventListener("pointerdown", requestMotionPermission, { passive: true });
  window.addEventListener("touchend", requestMotionPermission, { passive: true });
  window.addEventListener("click", requestMotionPermission, { passive: true });

  return () => {
    window.removeEventListener("deviceorientation", onOrientation);
    window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener);
    window.removeEventListener("devicemotion", onMotion);
    window.removeEventListener("pointerdown", requestMotionPermission);
    window.removeEventListener("touchend", requestMotionPermission);
    window.removeEventListener("click", requestMotionPermission);
  };
}
