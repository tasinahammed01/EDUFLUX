import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import "./globals.css";
import "./marketing.css";
import "./interaction.css";
import "./auth-firebase.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], variable: "--font-editorial", weight: "400", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "EduFlux — Teaching intelligence, beautifully connected", template: "%s | EduFlux" },
  description: "One focused workspace for assignments, thoughtful AI feedback, and visible student progress.",
  openGraph: { title: "EduFlux", description: "Teaching intelligence, beautifully connected.", type: "website" },
  twitter: { card: "summary_large_image", title: "EduFlux", description: "Teaching intelligence, beautifully connected." }
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#030817", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" className={`${manrope.variable} ${instrumentSerif.variable}`}><body>{children}</body></html>;
}
