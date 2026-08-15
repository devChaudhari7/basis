import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { getPair } from "@/lib/datasource";
import { pairMeta } from "@/lib/pair-meta";
import { getSpreadState } from "@/lib/utils";

export const runtime = "nodejs";
export const revalidate = 900;
export const alt = "Live spread statistics";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLOR = {
  bg: "#0A0B0D",
  surface: "#121417",
  line: "#23272E",
  text: "#E8EAED",
  muted: "#8A9099",
  amber: "#E8A33D",
  green: "#3FB27F",
  red: "#E5484D"
};

/** The font is vendored and passed explicitly: @vercel/og's built-in font
 *  lookup resolves to a malformed path on Windows, which fails the whole
 *  render. Supplying it directly works identically on every platform. */
async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const buffer = await readFile(
      join(process.cwd(), "assets", "fonts", "noto-sans-v27-latin-regular.ttf")
    );
    return Uint8Array.from(buffer).buffer;
  } catch {
    return null;
  }
}

async function imageOptions() {
  const data = await loadFont();
  return data
    ? { ...size, fonts: [{ name: "Noto Sans", data, style: "normal" as const, weight: 400 as const }] }
    : size;
}

/** A shared link renders the live reading, so the card is worth posting. */
export default async function Image({ params }: { params: { slug: string } }) {
  const pair = await getPair(params.slug).catch(() => null);
  const options = await imageOptions();

  if (!pair) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: COLOR.bg,
            color: COLOR.text,
            fontSize: 64,
            fontFamily: "monospace"
          }}
        >
          basis<span style={{ color: COLOR.amber }}>.</span>
        </div>
      ),
      options
    );
  }

  const meta = pairMeta(pair.slug);
  const state = getSpreadState(pair.latest.z, pair.series, pair.entryZ);
  const stateColor =
    state === "stretched" ? COLOR.red : state === "reverting" ? COLOR.amber : COLOR.green;
  const z = pair.latest.z;
  const zText = z === null ? "n/a" : `${z > 0 ? "+" : ""}${z.toFixed(2)}σ`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: COLOR.bg,
          padding: 64,
          fontFamily: "monospace",
          color: COLOR.text
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 30, letterSpacing: -1 }}>
            basis<span style={{ color: COLOR.amber }}>.</span>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: COLOR.muted, letterSpacing: 2 }}>
            {meta.category.toUpperCase()}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 56 }}>
          <div style={{ display: "flex", fontSize: 76, letterSpacing: -2 }}>{pair.displayName}</div>
          <div style={{ display: "flex", fontSize: 26, color: COLOR.muted, marginTop: 14 }}>
            {pair.legs[0].name} vs {pair.legs[1].name}
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, marginTop: "auto" }}>
          {[
            { label: "SPREAD", value: pair.latest.value.toFixed(meta.decimals), color: COLOR.text },
            { label: "Z-SCORE (60D)", value: zText, color: stateColor },
            {
              label: "1Y PERCENTILE",
              value: pair.latest.pctRank === null ? "—" : `${Math.round(pair.latest.pctRank)}th`,
              color: COLOR.text
            },
            {
              label: "HALF-LIFE",
              value: pair.latest.halfLife === null ? "none" : `${pair.latest.halfLife.toFixed(1)}d`,
              color: COLOR.text
            }
          ].map((cell) => (
            <div
              key={cell.label}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                background: COLOR.surface,
                border: `1px solid ${COLOR.line}`,
                borderRadius: 6,
                padding: "22px 24px"
              }}
            >
              <div style={{ display: "flex", fontSize: 18, color: COLOR.muted, letterSpacing: 2 }}>
                {cell.label}
              </div>
              <div style={{ display: "flex", fontSize: 46, color: cell.color, marginTop: 10 }}>
                {cell.value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 34,
            fontSize: 19,
            color: COLOR.muted
          }}
        >
          <div style={{ display: "flex" }}>
            EOD settlement {pair.latest.d} · research only, no prediction
          </div>
          <div style={{ display: "flex", color: stateColor }}>{state.toUpperCase()}</div>
        </div>
      </div>
    ),
    options
  );
}
