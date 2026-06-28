import type { Metadata } from "next";
import "./globals.css";
import "animate.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { Footer } from "@/components/Footer";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="ja" className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=DM+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Footer />
        <Toaster />
      </body>
    </html>
  );
}
