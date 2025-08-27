/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: "#f8f4f0",
        sandLight: "#fffaf5",
        sandRing: "#eadcc8",
        sandBorder: "#d3bfa7",
        brown: "#5e4634",
        cocoa: "#8c6239",
        caramel: "#a67c52",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};
