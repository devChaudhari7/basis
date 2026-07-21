import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        line: "var(--line)",
        text: "var(--text)",
        muted: "var(--muted)",
        amber: "var(--amber)",
        green: "var(--green)",
        red: "var(--red)",
        blue: "var(--blue)"
      },
      fontFamily: {
        display: ["var(--font-geist)", "Arial", "sans-serif"],
        sans: ["var(--font-geist)", "Arial", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      borderRadius: {
        terminal: "6px"
      },
      letterSpacing: {
        terminal: "0.08em",
        display: "-0.02em"
      },
      animation: {
        "tape-scroll": "tape-scroll 40s linear infinite",
        "fade-up": "fade-up 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "dial-sweep": "dial-sweep 560ms cubic-bezier(0.16, 1, 0.3, 1) both"
      },
      keyframes: {
        "tape-scroll": {
          "0%": { transform: "translate3d(0, 0, 0)" },
          "100%": { transform: "translate3d(-50%, 0, 0)" }
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translate3d(0, 8px, 0)" },
          "100%": { opacity: "1", transform: "translate3d(0, 0, 0)" }
        },
        "dial-sweep": {
          "0%": { strokeDashoffset: "1" },
          "100%": { strokeDashoffset: "0" }
        }
      }
    }
  },
  plugins: []
};

export default config;
