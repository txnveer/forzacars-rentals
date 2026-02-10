import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-barlow)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
      },
      colors: {
        // Primary palette
        primary: {
          DEFAULT: "#3A74A5",
          50: "#E8F1F7",
          100: "#D1E3EF",
          200: "#A3C7DF",
          300: "#75ABCF",
          400: "#478FBF",
          500: "#3A74A5",
          600: "#2E5C84",
          700: "#234563",
          800: "#172E42",
          900: "#0C1721",
        },
        // Light sky - subtle backgrounds
        sky: {
          light: "#B6D2E6",
          DEFAULT: "#B6D2E6",
        },
        // Main background
        surface: {
          DEFAULT: "#F3F3F1",
          50: "#FFFFFF",
          100: "#F9F9F8",
          200: "#F3F3F1",
          300: "#E8E8E5",
          400: "#D4D4D0",
        },
        // Accent colors
        accent: {
          sand: "#FDDD86",
          caramel: "#E4AF6B",
        },
      },
    },
  },
  plugins: [],
};

export default config;
