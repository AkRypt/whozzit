import { Fraunces, Outfit } from "next/font/google";

export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
