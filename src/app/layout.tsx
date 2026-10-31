import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { EVENT } from "@/lib/event";
import "./globals.css";

const sans = Inter({ variable: "--font-sans-family", subsets: ["latin"] });
const serif = Cormorant_Garamond({
  variable: "--font-serif-family",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: `${EVENT.partners[0]} & ${EVENT.partners[1]}`,
  description: EVENT.tagline,
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: EVENT.partners.join(" & ") },
};

export const viewport: Viewport = {
  themeColor: "#0b0a0a",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <AppShell />
      </body>
    </html>
  );
}
