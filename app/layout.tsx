import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";

import "./globals.css";

import { DeskFrame } from "@/app/_components/desk-frame";
import { getDesk } from "@/lib/datasource";
import { pairMeta } from "@/lib/pair-meta";
import type { TapeItem } from "@/lib/types";

const interTight = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display"
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono"
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BASIS_PUBLIC_URL ?? "https://basis-self.vercel.app"),
  title: {
    default: "basis — relative value desk",
    template: "%s — basis"
  },
  description:
    "A relative-value research desk monitoring statistical dislocations between related futures and index instruments. EOD data, honest statistics, no prediction.",
  applicationName: "basis",
  robots: { index: false, follow: false },
  openGraph: {
    title: "basis — relative value desk",
    description:
      "Monitoring statistical dislocations between related futures and index instruments.",
    siteName: "basis",
    type: "website"
  }
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0A0B0D",
  width: "device-width",
  initialScale: 1
};

export const revalidate = 900;

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const desk = await getDesk();
  const tapeItems: TapeItem[] = desk.pairs.map((pair) => ({
    slug: pair.slug,
    displayName: pair.displayName,
    z: pair.latest.z,
    value: pair.latest.value,
    decimals: pairMeta(pair.slug).decimals
  }));

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${interTight.variable} ${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <DeskFrame tapeItems={tapeItems}>{children}</DeskFrame>
      </body>
    </html>
  );
}
