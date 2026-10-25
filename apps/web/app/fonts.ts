import localFont from "next/font/local";

// Vazirmatn (SIL Open Font License, see ./fonts/OFL.txt), self-hosted so no third-party request is made.
export const vazirmatn = localFont({
  src: "./fonts/Vazirmatn-Variable.woff2",
  variable: "--font-vazirmatn",
  weight: "100 900",
  display: "swap",
});
