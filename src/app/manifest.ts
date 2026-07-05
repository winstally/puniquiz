import type { MetadataRoute } from "next";
import { PRODUCT_NAME, PRODUCT_SHORT, PRODUCT_TAGLINE } from "@/lib/brand";

// Web App Manifest (Next file convention — auto-injects <link rel="manifest">).
// Drives the Android/Chrome "install / add to home screen" app icon. iOS uses
// apple-icon.png; browser tabs use icon.png + favicon.ico. Icons live in public/
// and are white-flattened so the maskable safe-zone reads cleanly.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`,
    short_name: PRODUCT_SHORT,
    description: "ホストの問題にみんなで投票する、大人かわいいライブクイズ",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c5cfc", // --plum
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
