const { heroui } = require("@heroui/react");

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  plugins: [
    heroui({
      defaultTheme: "dark",
      defaultExtendTheme: "dark",
      themes: {
        dark: {
          colors: {
            background: "#0b0b0c",
            foreground: "#f4f1ea",
            content1: "#121212",
            content2: "#181818",
            content3: "#202020",
            content4: "#262626",
            divider: "#232323",
            primary: {
              DEFAULT: "#6eff8e",
              foreground: "#0b0b0c",
            },
            success: {
              DEFAULT: "#6eff8e",
              foreground: "#0b0b0c",
            },
            danger: {
              DEFAULT: "#ff7777",
              foreground: "#0b0b0c",
            },
            warning: {
              DEFAULT: "#ffb86a",
              foreground: "#0b0b0c",
            },
          },
        },
      },
    }),
  ],
};
