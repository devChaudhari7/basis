import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: {
    default: "basis — relative value desk",
    template: "%s — basis"
  },
  description:
    "A relative-value research desk for monitoring futures and index dislocations.",
  applicationName: "basis",
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0A0B0D",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} ${jetbrainsMono.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
