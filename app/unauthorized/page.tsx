import Link from "next/link";
import { SUPPORT_EMAIL } from "@/utils/variableConstant";

export const metadata = {
  title: "Access Denied — OrchardAds",
  description: "You are not authorized to view this page.",
};

export default function UnauthorizedPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex items-center flex-col gap-4 justify-center text-center px-6">
      <h1 className="text-2xl font-semibold text-destructive">Access Denied</h1>
      <p className="text-muted-foreground">You are not authorized to view this page.</p>
      <p className="text-sm text-muted-foreground mt-2">
        If you think this is wrong, email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
      <div className="flex items-center gap-3">
        <Link href="/signin" className="inline-flex h-9 items-center justify-center rounded-full bg-primary text-primary-foreground px-5 text-sm font-medium hover:bg-primary/90 transition-colors">
          Sign in
        </Link>
        <Link href="/" className="inline-flex h-9 items-center justify-center rounded-full border border-border px-5 text-sm font-medium hover:bg-accent transition-colors">
          Go home
        </Link>
      </div>
    </div>
  );
}
