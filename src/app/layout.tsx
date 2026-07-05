import type { Metadata } from "next";
import "./globals.css";
import "animate.css";
import { DM_Mono, Geist, Zen_Kaku_Gothic_New, Zen_Maru_Gothic } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { Footer } from "@/components/Footer";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const zenMaru = Zen_Maru_Gothic({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
});
const zenKaku = Zen_Kaku_Gothic_New({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "puni — live quiz lounge",
  description: "ホストの問題にみんなで投票する、大人かわいいライブクイズ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={cn("font-sans", geist.variable, zenMaru.variable, zenKaku.variable, dmMono.variable)}>
      <body>
        {children}
        <Footer />
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
