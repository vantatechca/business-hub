import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      animation: {
        "fade-up":     "fadeUp .3s ease both",
        "fade-in":     "fadeIn .2s ease both",
        "slide-right": "slideInRight .25s ease both",
        "slide-up":    "slideInUp .25s ease both",
        "scale-pop":   "scalePop .35s cubic-bezier(0.34,1.56,0.64,1) both",
        shimmer:       "shimmer 1.5s infinite",
      },
      keyframes: {
        fadeUp:        { from:{ opacity:"0", transform:"translateY(10px)" }, to:{ opacity:"1", transform:"translateY(0)" } },
        fadeIn:        { from:{ opacity:"0" }, to:{ opacity:"1" } },
        slideInRight:  { from:{ opacity:"0", transform:"translateX(20px)" }, to:{ opacity:"1", transform:"translateX(0)" } },
        slideInUp:     { from:{ opacity:"0", transform:"translateY(16px)" }, to:{ opacity:"1", transform:"translateY(0)" } },
        scalePop:      { "0%":{ transform:"scale(.85)", opacity:"0" }, "60%":{ transform:"scale(1.05)" }, "100%":{ transform:"scale(1)", opacity:"1" } },
        shimmer:       { "0%":{ backgroundPosition:"-200% 0" }, "100%":{ backgroundPosition:"200% 0" } },
      },
    },
  },
  plugins: [],
};
export default config;
