import Link from "next/link";
import Image from "next/image";

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#optimize", label: "Optimize" },
  { href: "/autopilot", label: "Autopilot" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
];

export default function MarketingHeader({ active }: { active?: string }) {
  return (
    <header className="w-full py-4 sticky top-0 bg-background/80 backdrop-blur-xl z-50 border-b border-border/60">
      <div className="max-w-6xl mx-auto px-6 sm:px-10 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/assets/logo.svg" alt="OrchardAds" width={120} height={32} className="h-8 w-auto" />
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          {navLinks.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className={
                active === l.label
                  ? "text-foreground font-medium"
                  : "hover:text-foreground transition-colors"
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <Link href="/signin" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2">Sign in</Link>
          <Link href="/signup" className="inline-flex h-9 items-center justify-center rounded-full bg-foreground text-background px-5 text-sm font-medium hover:opacity-90 transition-opacity">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
