import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#211936",
        violet: "#8B5CF6",
        lavender: "#F2EDFF"
      }
    }
  },
  plugins: []
};

export default config;
