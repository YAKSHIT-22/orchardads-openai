import Link from "next/link";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Eyebrow from "@/components/marketing/Eyebrow";

export const metadata = {
  title: "Terms & Conditions — OrchardAds",
  description: "The terms that govern your use of OrchardAds.",
};

type Section = {
  id: string;
  title: string;
  text?: string;
  items?: string[];
};

const sections: Section[] = [
  {
    id: "acceptance-of-terms",
    title: "1. Acceptance of Terms",
    text: "By accessing or using OrchardAds (\"the Service\"), you agree to be bound by these Terms & Conditions (\"Terms\"). If you do not agree to these Terms, you may not use the Service. These Terms apply to all users, including those who register for an account and connect their OpenAI Ads credentials.",
  },
  {
    id: "description-of-service",
    title: "2. Description of Service",
    text: "OrchardAds is an independent third-party web application for managing and optimizing OpenAI Ads campaigns via OpenAI's official Advertiser API. OrchardAds is not affiliated with, endorsed by, sponsored by, or in any way officially connected with OpenAI. The OpenAI and ChatGPT names, logos and related marks are trademarks of OpenAI.",
  },
  {
    id: "eligibility",
    title: "3. Eligibility",
    text: "You must be at least 18 years of age and have a valid OpenAI Ads account to use OrchardAds. By using the Service, you represent and warrant that you meet these requirements and that all information you provide is accurate and complete.",
  },
  {
    id: "account-registration-security",
    title: "4. Account Registration & Security",
    items: [
      "You are responsible for maintaining the confidentiality of your OrchardAds account credentials.",
      "You must notify us immediately at orchardads.in@gmail.com if you suspect unauthorized access to your account.",
      "You are responsible for all activities that occur under your account.",
      "You may not share your account with any other person or entity.",
      "OrchardAds reserves the right to suspend or terminate accounts that violate these Terms.",
    ],
  },
  {
    id: "openai-ads-credentials-api-usage",
    title: "5. OpenAI Ads Credentials & API Usage",
    items: [
      "You are solely responsible for ensuring you are authorized to manage the OpenAI Ads account whose API key you connect.",
      "By providing an OpenAI Ads API key, you authorize OrchardAds to make API requests on your behalf, including reads and — where you approve them — writes that change budgets, bids and the running state of your campaigns.",
      "OrchardAds will never archive an entity or pause your ad account automatically. Archiving is irreversible, and pausing the account would stop everything you are running; both require an explicit action from you.",
      "OrchardAds encrypts and securely stores your credentials but cannot guarantee absolute security against all possible threats.",
      "You must comply with OpenAI's advertising policies and API terms at all times.",
      "OrchardAds is not responsible for any action OpenAI takes against your ad account, including review rejection, suspension or termination.",
    ],
  },
  {
    id: "acceptable-use",
    title: "6. Acceptable Use",
    text: "You agree not to use OrchardAds to:",
    items: [
      "Violate any applicable laws or regulations.",
      "Violate OpenAI's advertising policies or API terms.",
      "Attempt to reverse-engineer, scrape, or extract data from the Service beyond normal use.",
      "Upload malicious code, scripts, or files.",
      "Impersonate any person or entity.",
      "Interfere with or disrupt the integrity or performance of the Service.",
      "Create fraudulent campaigns or engage in ad fraud.",
    ],
  },
  {
    id: "intellectual-property",
    title: "7. Intellectual Property",
    text: "All content, design, code, and materials within OrchardAds are the intellectual property of OrchardAds and its creators, protected by applicable copyright and intellectual property laws. You may not copy, reproduce, distribute, or create derivative works from any part of the Service without express written permission.",
  },
  {
    id: "disclaimers",
    title: "8. Disclaimers",
    items: [
      "OrchardAds is provided \"as is\" and \"as available\" without warranties of any kind, express or implied.",
      "We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components.",
      "OrchardAds is not responsible for the accuracy, completeness or timeliness of data returned by the OpenAI Ads API. Revenue and ROAS figures, where shown, are modelled from a value per conversion that you supply — OpenAI Ads does not report revenue.",
      "Campaign performance, spend and results are entirely subject to OpenAI's systems and auction. OrchardAds makes no guarantee about advertising outcomes, and recommendations are suggestions you remain responsible for approving.",
    ],
  },
  {
    id: "limitation-of-liability",
    title: "9. Limitation of Liability",
    text: "To the maximum extent permitted by applicable law, OrchardAds and its creators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of revenue, loss of data, or loss of business opportunity arising from your use of the Service, even if OrchardAds has been advised of the possibility of such damages. Our total liability to you shall not exceed the amount you paid for the Service in the twelve months preceding the claim.",
  },
  {
    id: "termination",
    title: "10. Termination",
    text: "You may terminate your account at any time by contacting orchardads.in@gmail.com. OrchardAds reserves the right to suspend or terminate your access to the Service at any time, with or without notice, for conduct that violates these Terms or is harmful to other users, OrchardAds, or third parties. Upon termination, your credentials and account data will be purged within 30 days.",
  },
  {
    id: "changes-to-terms",
    title: "11. Changes to Terms",
    text: "OrchardAds reserves the right to modify these Terms at any time. We will notify you of material changes via email or a prominent notice within the Service. Your continued use of the Service after changes constitutes acceptance of the revised Terms.",
  },
  {
    id: "governing-law",
    title: "12. Governing Law",
    text: "These Terms shall be governed by and construed in accordance with the laws of India, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Hyderabad, Telangana, India.",
  },
  {
    id: "contact",
    title: "13. Contact",
    text: "For any questions about these Terms, please contact us at orchardads.in@gmail.com or visit our Contact page.",
  },
];

export default function TermsPage() {
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
          <Eyebrow>Terms &amp; Conditions</Eyebrow>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em]">Clear terms, no surprises.</h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl">
            Please read these Terms carefully before using OrchardAds. By using our Service, you agree to be bound by these Terms.
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
        <div className="max-w-3xl flex flex-col gap-10 pb-6">
          {sections.map((s) => (
            <div key={s.id} id={s.id} className="flex flex-col gap-3 scroll-mt-24">
              <h2 className="text-lg font-semibold text-foreground border-l-4 border-primary pl-4">{s.title}</h2>
              <div className="pl-1 flex flex-col gap-2">
                {s.text && <p className="text-sm text-muted-foreground leading-relaxed">{s.text}</p>}
                {s.items && (
                  <ul className="flex flex-col gap-2">
                    {s.items.map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}

          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 flex flex-col gap-2 mt-2">
            <p className="text-sm font-semibold text-foreground">Questions about these Terms?</p>
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
