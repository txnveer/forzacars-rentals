import type { Metadata } from "next";
import { Inter, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import CompareTray from "@/components/CompareTray";

/**
 * Typography setup:
 * 1) Wordmark/Brand: Barlow Condensed ExtraBold Italic (Forza Horizon style)
 * 2) UI/Body: Inter (clean, modern grotesk)
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["800"], // ExtraBold
  style: ["italic"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ForzaCars Rentals",
  description:
    "ForzaCars Rentals — Browse and rent premium cars with ease.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${barlowCondensed.variable}`}>
      <body className="font-sans antialiased">
        <Navbar />
        <main>{children}</main>
        <CompareTray />
      </body>
    </html>
  );
}
