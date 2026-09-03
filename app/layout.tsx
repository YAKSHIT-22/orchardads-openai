import type { Metadata, Viewport } from "next";
import { Urbanist } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import QueryProvider from "@/components/global/QueryProvider";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OrchardAds — Apple Search Ads, on autopilot",
  description:
    "Create, manage and optimize Apple Search Ads campaigns — wasted-spend detection, keyword harvesting, automated rules and reports in one place.",
  keywords:
    "Apple Search Ads, Apple Ads, campaign management, ads optimization, keyword harvesting, negative keywords, automated rules, reporting",
  applicationName: "OrchardAds",
  openGraph: {
    title: "OrchardAds — Apple Search Ads, on autopilot",
    description:
      "Create, manage and optimize Apple Search Ads campaigns — wasted-spend detection, keyword harvesting, automated rules and reports in one place.",
    siteName: "OrchardAds",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "OrchardAds — Apple Search Ads, on autopilot",
    description:
      "Create, manage and optimize Apple Search Ads campaigns with an optimization engine that acts on your numbers.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${urbanist.variable} antialiased`}>
        <QueryProvider>
          <Toaster position="top-center" richColors />
          <>{children}</>
        </QueryProvider>
      </body>
    </html>
  );
}
