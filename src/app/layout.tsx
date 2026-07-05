import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { MotionProvider } from "@/components/MotionProvider";
import { MotionGravityPrimer } from "@/components/MotionGravityPrimer";
import { Footer } from "@/components/Footer";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`,
  description: "ホストの問題にみんなで投票する、大人かわいいライブクイズ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <MotionGravityPrimer />
        <MotionProvider>
          <div data-page>{children}</div>
          <Footer />
        </MotionProvider>
        <Toaster />
      </body>
    </html>
  );
}
