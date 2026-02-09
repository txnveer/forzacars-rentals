import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import CompareTray from "@/components/CompareTray";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="en">
      <body className={inter.className}>
        <Navbar />
        <main>{children}</main>
        <CompareTray />
      </body>
    </html>
  );
}
