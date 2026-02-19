import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        mosque: {
          darkest:    "#03060f",
          dark:       "#070e1d",
          navy:       "#0c1a30",
          card:       "#0f2040",
          gold:       "#c9a84c",
          "gold-light": "#e8c97a",
          "gold-dim": "rgba(201,168,76,0.15)",
          green:      "#1a5c3a",
          "green-light": "#2d8a5a",
          cream:      "#f5f0e8",
        },
      },
      fontFamily: {
        arabic: ["Amiri", "serif"],
        sans:   ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(135deg, #b8922e 0%, #e8c97a 45%, #c9a84c 70%, #f0d688 100%)",
        "night-sky": "radial-gradient(ellipse at 50% 0%, #1a2f5e 0%, #0a1628 40%, #03060f 100%)",
      },
      animation: {
        "float":       "float-up 4s ease-in-out infinite",
        "pulse-gold":  "pulse-gold 3s ease-in-out infinite",
        "breathe":     "breathe 4s ease-in-out infinite",
        "fade-in-up":  "fade-in-up 0.6s ease-out both",
        "audio-bounce":"audio-bounce 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
