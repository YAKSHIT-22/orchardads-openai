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
  title: "OrchardAds — OpenAI Ads optimization",
  description:
    "Find out why your ChatGPT Ads aren't delivering, where spend is going nowhere, and fix it safely — diagnostics, recommendations and guarded automation in one place.",
  keywords:
    "OpenAI Ads, ChatGPT Ads, ads optimization, campaign management, serving issues, ad review, wasted spend, budget pacing, reporting",
  applicationName: "OrchardAds",
  openGraph: {
    title: "OrchardAds — OpenAI Ads optimization",
    description:
      "Find out why your ChatGPT Ads aren't delivering, where spend is going nowhere, and fix it safely — diagnostics, recommendations and guarded automation in one place.",
    siteName: "OrchardAds",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "OrchardAds — OpenAI Ads optimization",
    description:
      "An optimization layer for OpenAI Ads that reads the platform's own diagnostics and acts only on your approval.",
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
