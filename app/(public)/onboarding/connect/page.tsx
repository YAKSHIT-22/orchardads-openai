"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import InfoSteps from "@/components/user/infoSteps";
import { CampaignStepper } from "@/components/user/CampaignStepper";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ADS_MANAGER_SETTINGS_URL, ADS_MANAGER_URL } from "@/utils/variableConstant";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

/* ── Validation ─────────────────────────────────────────────────────────────
 * Hard rule: non-empty. Format is a SOFT hint only — OpenAI has not published a
 * key prefix or length, and blocking a valid key because we guessed its shape
 * would be a far worse failure than letting the real API reject it. */
const connectSchema = z.object({
  apiKey: z.string().trim().min(8, "Paste the full API key from Ads Manager"),
  label: z.string().trim().max(80).optional(),
});

type ConnectForm = z.infer<typeof connectSchema>;

const STEPS = ["Open Ads Manager", "Create a key", "Paste it here"];

/* ── Presentational helpers ────────────────────────────────────────────────── */

function StepHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof KeyRound;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-[18px] h-[18px]" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>;
}

function SoftWarning({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-amber-600 dark:text-amber-500 flex items-start gap-1.5 leading-relaxed">
      <CircleAlert className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
      <span>{children}</span>
    </p>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary font-medium hover:underline inline-flex items-center gap-1"
    >
      {children}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

function NumberedList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
            {i + 1}
          </span>
          <span className="text-sm text-muted-foreground leading-relaxed">{item}</span>
        </li>
      ))}
    </ol>
  );
}

const OPEN_INSTRUCTIONS: React.ReactNode[] = [
  <>
    Sign in at <ExtLink href={ADS_MANAGER_URL}>ads.openai.com</ExtLink> with the account that owns
    your advertising. You need <strong className="text-foreground font-medium">admin access</strong>{" "}
    to the ad account — a key can only be created by someone who can already manage it.
  </>,
  <>
    If you manage several ad accounts, switch to the one you want to connect{" "}
    <strong className="text-foreground font-medium">before</strong> creating the key. Every key is
    tied to exactly one ad account, so the account you're viewing is the account the key will
    control.
  </>,
  <>
    Open the <strong className="text-foreground font-medium">Settings</strong> tab —{" "}
    <ExtLink href={ADS_MANAGER_SETTINGS_URL}>ads.openai.com/settings</ExtLink>.
  </>,
];

const KEY_INSTRUCTIONS: React.ReactNode[] = [
  <>
    In Settings, find the <strong className="text-foreground font-medium">API keys</strong> section
    (under General) and create a new key. Give it a name you'll recognise later, such as{" "}
    <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">OrchardAds</span>, so you
    can tell it apart from your other integrations.
  </>,
  <>
    Copy the key <strong className="text-foreground font-medium">immediately</strong>. OpenAI shows
    the full value once — if you close the dialog without copying it, you'll need to create a new
    one.
  </>,
  <>
    Don't reuse a key you've already given to another tool. A separate key per integration means you
    can revoke ours without breaking anything else.
  </>,
];

/* ── Page ──────────────────────────────────────────────────────────────────── */

type ConnectResult = {
  message: string;
  data: {
    id: string;
    adAccountId: string;
    adAccountName: string | null;
    currencyCode: string;
    timezone: string;
    apiKeyLast4: string;
  };
  accountReview?: { status?: string; reason?: string } | null;
};

const OnboardingConnectPage = () => {
  const [step, setStep] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [result, setResult] = useState<ConnectResult | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ConnectForm>({ resolver: zodResolver(connectSchema) });

  const apiKeyValue = watch("apiKey") ?? "";
  // Soft hints only. Never blocks submission.
  const looksTruncated = apiKeyValue.trim().length > 0 && apiKeyValue.trim().length < 20;
  const hasWhitespace = /\s/.test(apiKeyValue.trim());

  const connectMutation = useMutation({
    mutationFn: async (form: ConnectForm) => {
      const res = await api.post("/connections", form);
      return res.data as ConnectResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success("Ad account connected");
    },
    onError: () => {
      toast.error("Couldn't connect — check the key and try again");
    },
  });

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => router.push("/tools/dashboard"), 2600);
    return () => clearTimeout(t);
  }, [result, router]);

  const serverError =
    (connectMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
    (connectMutation.isError ? "Something went wrong. Please try again." : null);

  const brandReviewPending =
    !!result?.accountReview?.status && result.accountReview.status !== "approved";

  const infoStep = result ? STEPS.length : step;

  return (
    <section className="w-full min-h-[100dvh] flex bg-background px-4 py-8">
      <div className="w-full max-w-5xl m-auto flex flex-col gap-6">
        <div className="flex items-center justify-center">
          <img src="/assets/logo.svg" className="h-14 sm:h-16 w-auto" alt="OrchardAds logo" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Connect your OpenAI Ads account
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            One-time setup. You'll paste one API key — we'll do the rest.
          </p>
        </div>

        <div className="w-full flex md:flex-row flex-col gap-6 items-start">
          <div className="md:w-3/5 w-full bg-card border border-border rounded-xl p-6 flex flex-col gap-5">
            {result ? (
              /* ── Success ── */
              <div className="flex flex-col items-center justify-center text-center gap-4 py-8">
                <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <PartyPopper className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">You're connected!</h2>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    {result.data.adAccountName || result.data.adAccountId} is linked. We're starting
                    your first sync — taking you to your dashboard.
                  </p>
                </div>

                <dl className="w-full max-w-sm mt-2 rounded-xl border border-border bg-muted/40 divide-y divide-border text-left">
                  {[
                    ["Ad account", result.data.adAccountName || result.data.adAccountId],
                    ["Account ID", result.data.adAccountId],
                    ["Currency", result.data.currencyCode],
                    ["Time zone", result.data.timezone],
                    ["Key stored", `••••${result.data.apiKeyLast4}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="text-xs font-medium text-foreground truncate">{v}</dd>
                    </div>
                  ))}
                </dl>

                {brandReviewPending && (
                  <div className="w-full max-w-sm text-left rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <SoftWarning>
                      This ad account's brand review is{" "}
                      <strong className="font-medium">{result.accountReview?.status}</strong>
                      {result.accountReview?.reason ? ` (${result.accountReview.reason})` : ""}. An
                      account can't serve ads until brand review is approved — Serving Doctor will
                      show you exactly what to fix.
                    </SoftWarning>
                  </div>
                )}

                <Button className="rounded-lg mt-1" onClick={() => router.push("/tools/dashboard")}>
                  Go to dashboard now
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            ) : (
              <>
                <CampaignStepper steps={STEPS} current={step} onStepClick={(i) => setStep(i)} />

                {/* ── Step 1 ── */}
                {step === 0 && (
                  <div className="flex flex-col gap-5">
                    <StepHeading
                      icon={ExternalLink}
                      title="Open OpenAI Ads Manager"
                      description="Everything happens in your own OpenAI account — we never ask for your password."
                    />
                    <NumberedList items={OPEN_INSTRUCTIONS} />
                    <Hint>
                      Don't have an ad account yet? Create one at{" "}
                      <ExtLink href={ADS_MANAGER_URL}>ads.openai.com</ExtLink> first. Self-serve
                      access is open in a growing list of countries, including India since 31 August
                      2026.
                    </Hint>
                    <div className="flex justify-end">
                      <Button className="rounded-lg" onClick={() => setStep(1)}>
                        I'm in Settings
                        <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── Step 2 ── */}
                {step === 1 && (
                  <div className="flex flex-col gap-5">
                    <StepHeading
                      icon={KeyRound}
                      title="Create an API key"
                      description="Settings > General > API keys. One key controls one ad account."
                    />
                    <NumberedList items={KEY_INSTRUCTIONS} />

                    <div className="rounded-xl border border-border bg-muted/40 p-4 flex gap-3">
                      <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs font-medium text-foreground">
                          What this key lets OrchardAds do
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Read your campaigns, ad groups, ads and performance, and — only after you
                          approve each change — update budgets and bids, and pause or resume
                          entities. We never archive anything and never pause your ad account:
                          archiving is irreversible, and pausing the account would stop your entire
                          business.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-between">
                      <Button variant="outline" className="rounded-lg" onClick={() => setStep(0)}>
                        <ArrowLeft className="w-4 h-4 mr-1.5" />
                        Back
                      </Button>
                      <Button className="rounded-lg" onClick={() => setStep(2)}>
                        I've copied my key
                        <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── Step 3 ── */}
                {step === 2 && (
                  <form
                    className="flex flex-col gap-5"
                    onSubmit={handleSubmit((d) => connectMutation.mutate(d))}
                  >
                    <StepHeading
                      icon={Lock}
                      title="Paste your API key"
                      description="We'll verify it with OpenAI, then encrypt it before it's stored."
                    />

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="apiKey" className="text-sm">
                        OpenAI Ads API key
                      </Label>
                      <div className="relative">
                        <Input
                          id="apiKey"
                          type={reveal ? "text" : "password"}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="Paste the key you copied from Ads Manager"
                          className={cn("rounded-lg pr-10 font-mono text-sm", errors.apiKey && "border-destructive")}
                          {...register("apiKey")}
                        />
                        <button
                          type="button"
                          onClick={() => setReveal((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={reveal ? "Hide key" : "Show key"}
                        >
                          {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errors.apiKey && (
                        <p className="text-xs text-destructive">{errors.apiKey.message}</p>
                      )}
                      {hasWhitespace && (
                        <SoftWarning>
                          There's a space inside the key. That usually means part of it was cut off
                          when copying — paste it again.
                        </SoftWarning>
                      )}
                      {looksTruncated && !hasWhitespace && (
                        <SoftWarning>
                          That looks shorter than a typical API key. Double-check you copied the
                          whole value.
                        </SoftWarning>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="label" className="text-sm">
                        Label <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <Input
                        id="label"
                        placeholder="e.g. Acme — main account"
                        className="rounded-lg"
                        {...register("label")}
                      />
                      <Hint>
                        Helpful when you connect several ad accounts. We'll default to the account
                        name OpenAI gives us.
                      </Hint>
                    </div>

                    {serverError && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                        <p className="text-xs text-destructive flex items-start gap-1.5 leading-relaxed">
                          <CircleAlert className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
                          <span>{serverError}</span>
                        </p>
                      </div>
                    )}

                    <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-3 py-2.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Encrypted with AES-256-GCM before it's saved. Never sent to a browser, never
                        logged, never shown again — from here on you'll only see the last four
                        characters. Delete the key in Ads Manager any time to cut off access.
                      </p>
                    </div>

                    <div className="flex justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => setStep(1)}
                      >
                        <ArrowLeft className="w-4 h-4 mr-1.5" />
                        Back
                      </Button>
                      <Button type="submit" className="rounded-lg" disabled={connectMutation.isPending}>
                        {connectMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                            Verifying with OpenAI…
                          </>
                        ) : (
                          <>
                            Connect account
                            <ArrowRight className="w-4 h-4 ml-1.5" />
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>

          <InfoSteps current={infoStep} />
        </div>
      </div>
    </section>
  );
};

export default OnboardingConnectPage;
