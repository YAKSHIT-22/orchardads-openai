import Link from "next/link";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Eyebrow from "@/components/marketing/Eyebrow";

export const metadata = {
  title: "Privacy Policy — OrchardAds",
  description: "How OrchardAds collects, uses, and protects your data.",
};

const sections = [
  {
    id: "information-we-collect",
    title: "1. Information We Collect",
    content: [
      {
        subtitle: "Account Information",
        text: "When you register for OrchardAds, we collect your name, email address, and a securely hashed password. We use this to authenticate you and communicate important service updates.",
      },
      {
        subtitle: "OpenAI Ads Credentials",
        text: "To connect your OpenAI Ads account you provide an API key that you issue yourself in OpenAI Ads Manager. It is encrypted at rest with AES-256-GCM before it is written to our database, is decrypted only in memory for the duration of a single request, and is never sent to a browser, written to a log, or included in an error message. After you submit it, only the last four characters are ever displayed. You can revoke it at any time by deleting the key in Ads Manager — our access ends immediately and there is nothing to uninstall.",
      },
      {
        subtitle: "Usage Data",
        text: "We collect anonymized usage data (pages visited, features used, error logs) to improve the platform. This data cannot be used to identify you personally.",
      },
    ],
  },
  {
    id: "how-we-use-your-information",
    title: "2. How We Use Your Information",
    content: [
      {
        subtitle: "Service Delivery",
        text: "Your OpenAI Ads API key is used solely to authenticate requests to the OpenAI Ads API on your behalf. We never use your advertising data for any purpose other than fulfilling your requests within OrchardAds, and we never use it to train models.",
      },
      {
        subtitle: "Communication",
        text: "We may email you about service updates, security notices, or significant changes to our policies. You can opt out of marketing emails at any time.",
      },
      {
        subtitle: "Security & Fraud Prevention",
        text: "We use account and usage data to detect suspicious activity, prevent unauthorized access, and maintain platform integrity.",
      },
    ],
  },
  {
    id: "data-storage-security",
    title: "3. Data Storage & Security",
    content: [
      {
        subtitle: "Encryption",
        text: "All sensitive credentials are encrypted at rest using AES-256 encryption. All data in transit is protected via TLS 1.2 or higher.",
      },
      {
        subtitle: "Database",
        text: "Your data is stored in a managed PostgreSQL database hosted on secure, SOC 2-compliant infrastructure. Access is restricted to authorized systems only.",
      },
      {
        subtitle: "Session Management",
        text: "Authentication sessions are managed via short-lived JWTs stored in HTTP-only, Secure cookies. We do not use localStorage or sessionStorage for sensitive tokens.",
      },
    ],
  },
  {
    id: "data-sharing",
    title: "4. Data Sharing",
    content: [
      {
        subtitle: "We Do Not Sell Your Data",
        text: "OrchardAds does not sell, rent, or trade your personal information or your OpenAI Ads credentials to any third party, ever.",
      },
      {
        subtitle: "OpenAI",
        text: "API requests made on your behalf are sent directly to OpenAI's advertising API at api.ads.openai.com. OpenAI's own privacy policies govern how OpenAI handles those requests and the data they return.",
      },
      {
        subtitle: "Service Providers",
        text: "We may use third-party services (e.g., email delivery, error monitoring) that process limited data on our behalf under strict data processing agreements.",
      },
    ],
  },
  {
    id: "your-rights",
    title: "5. Your Rights",
    content: [
      {
        subtitle: "Access & Portability",
        text: "You can request a copy of all personal data we hold about you by contacting orchardads.in@gmail.com",
      },
      {
        subtitle: "Deletion",
        text: "You can request deletion of your account and all associated data at any time. Upon deletion, your encrypted credentials are permanently purged from our systems within 30 days.",
      },
      {
        subtitle: "Correction",
        text: "If any information we hold is inaccurate, you can update it directly in your profile settings or contact us to correct it.",
      },
    ],
  },
  {
    id: "cookies",
    title: "6. Cookies",
    content: [
      {
        subtitle: "Essential Cookies Only",
        text: "OrchardAds uses only essential cookies required for authentication (HTTP-only JWT session cookie). We do not use tracking, analytics, or advertising cookies.",
      },
    ],
  },
  {
    id: "childrens-privacy",
    title: "7. Children's Privacy",
    content: [
      {
        subtitle: "",
        text: "OrchardAds is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from minors. If you believe a minor has registered, please contact us immediately.",
      },
    ],
  },
  {
    id: "changes-to-this-policy",
    title: "8. Changes to This Policy",
    content: [
      {
        subtitle: "",
        text: "We may update this Privacy Policy from time to time. We will notify you of significant changes via email or a prominent notice within the dashboard. Continued use of OrchardAds after changes constitutes acceptance of the updated policy.",
      },
    ],
  },
  {
    id: "contact",
    title: "9. Contact",
    content: [
      {
        subtitle: "",
        text: "For any privacy-related questions or requests, contact us at orchardads.in@gmail.com or visit our Contact page.",
      },
    ],
  },
];

export default function PrivacyPage() {
  const lastUpdated = "July 17, 2026";

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col antialiased">
      <MarketingHeader />

      {/* Hero */}
      <section className="relative w-full overflow-hidden border-b border-border/60">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/3 -top-40 h-80 w-[40rem] rounded-full bg-primary/10 blur-[130px]" />
        </div>
        <div className="w-full max-w-6xl mx-auto px-6 sm:px-10 pt-20 pb-12 flex flex-col gap-4">
          <Eyebrow>Privacy Policy</Eyebrow>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em]">Your privacy matters.</h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl">
            OrchardAds is built on the principle that your data belongs to you. This policy explains exactly what we collect,
            how we use it, and the rights you have over it.
          </p>
          <p className="text-xs text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>
      </section>

      {/* Mobile section chips */}
      <nav className="lg:hidden w-full max-w-6xl mx-auto px-6 sm:px-10 pt-6">
        <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors whitespace-nowrap"
            >
              {s.title.replace(/^\d+\.\s*/, "")}
            </a>
          ))}
        </div>
      </nav>

      {/* Content */}
      <section className="w-full max-w-6xl mx-auto px-6 sm:px-10 py-10 lg:py-14 grid lg:grid-cols-[240px_1fr] gap-10 lg:gap-16 flex-1">
        {/* Sidebar nav */}
        <nav className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-2">On this page</p>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="text-sm text-muted-foreground hover:text-foreground rounded-lg px-3 py-1.5 hover:bg-accent transition-colors"
              >
                {s.title.replace(/^\d+\.\s*/, "")}
              </a>
            ))}
          </div>
        </nav>

        {/* Sections */}
        <div className="max-w-3xl flex flex-col gap-12 pb-6">
          {sections.map((s) => (
            <div key={s.id} id={s.id} className="flex flex-col gap-4 scroll-mt-24">
              <h2 className="text-xl font-semibold text-foreground border-l-4 border-primary pl-4">{s.title}</h2>
              <div className="flex flex-col gap-4 pl-1">
                {s.content.map((c, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    {c.subtitle && <h3 className="text-sm font-semibold text-foreground">{c.subtitle}</h3>}
                    <p className="text-sm text-muted-foreground leading-relaxed">{c.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">Questions about this policy?</p>
            <p className="text-sm text-muted-foreground">
              Contact us at{" "}
              <a href="mailto:orchardads.in@gmail.com" className="text-primary hover:underline">orchardads.in@gmail.com</a>
              {" "}or visit our{" "}
              <Link href="/contact" className="text-primary hover:underline">Contact page</Link>.
            </p>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
