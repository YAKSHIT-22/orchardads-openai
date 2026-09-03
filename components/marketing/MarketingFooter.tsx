import Link from "next/link";
import Image from "next/image";

const footerLinks = [
  { href: "/autopilot", label: "Autopilot" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export default function MarketingFooter() {
  return (
    <footer className="w-full border-t border-border py-10 mt-auto">
      <div className="max-w-6xl mx-auto px-6 sm:px-10 flex flex-col sm:flex-row items-start justify-between gap-6">
        <div className="max-w-xs">
          <Image src="/assets/logo.svg" alt="OrchardAds" width={100} height={28} className="h-7 w-auto" />
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">Manage and optimize Apple Search Ads — built on Apple&apos;s Campaign Management API v5.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {footerLinks.map((l) => (
            <Link key={l.label} href={l.href} className="hover:text-foreground transition-colors">{l.label}</Link>
          ))}
          <Link href="https://developer.apple.com/documentation/apple_ads" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Apple Ads Docs</Link>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 sm:px-10 mt-8 pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} OrchardAds. Not affiliated with Apple Inc.</p>
        <p>Made for performance marketers.</p>
      </div>
    </footer>
  );
}
