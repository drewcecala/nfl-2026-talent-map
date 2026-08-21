import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "The Geography of NFL Talent",
    template: "%s | The Geography of NFL Talent",
  },
  description:
    "Explore verified high-school counties for 2015–2026 by default, with an audited 2000–2026 NFL Draft dataset and a clearly labeled birth-county fallback view.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "The Geography of NFL Talent",
    description:
      "An evidence-audited county map of NFL Draft talent with visible coverage and missing-data controls.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "The Geography of NFL Talent",
    description:
      "An evidence-audited county map of NFL Draft talent with visible coverage and missing-data controls.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
