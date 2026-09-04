"use client";

import { Clock, ChevronRight, Mail, MessageSquare, CheckCircle2 } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Eyebrow from "@/components/marketing/Eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

const faqs = [
  {
    q: "Is OrchardAds an official OpenAI product?",
    a: "No. OrchardAds is an independent third-party tool built on OpenAI's official Advertiser API. We are not affiliated with OpenAI.",
  },
  {
    q: "How is my OpenAI Ads data handled?",
    a: "Your API key is encrypted at rest with AES-256-GCM, used only server-side, and never sent to a browser or written to a log. Only the last four characters are ever displayed back to you.",
  },
  {
    q: "What if I lose access to my OpenAI Ads account?",
    a: "You can reconnect your account anytime from Settings — regenerate your key pair and re-enter your IDs.",
  },
  {
    q: "Do you offer refunds?",
    a: "OrchardAds is completely free during the beta, so there's nothing to refund.",
  },
];

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.id]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send message");
      toast.success("Message sent successfully!");
      setSubmitted(true);
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (error: any) {
      toast.error(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col antialiased">
      <MarketingHeader />

      {/* Hero */}
      <section className="relative w-full overflow-hidden border-b border-border/60">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/4 -top-40 h-[24rem] w-[42rem] rounded-full bg-primary/12 blur-[130px]" />
        </div>
        <div className="max-w-4xl mx-auto px-6 sm:px-10 pt-24 pb-16 flex flex-col gap-5">
          <Eyebrow>Contact</Eyebrow>
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-[-0.03em] leading-[1.03]">
            Let&apos;s <span className="italic font-serif bg-gradient-to-br from-primary to-fuchsia-500 bg-clip-text text-transparent">talk.</span>
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-xl">
            Have a question, found a bug, or want to partner with us? Drop us a note — we read every message.
          </p>
        </div>
      </section>

      {/* Main */}
      <section className="w-full max-w-6xl mx-auto px-6 sm:px-10 py-16 grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
        {/* Form */}
        <div className="bg-card border border-border rounded-3xl p-7 shadow-sm">
          <div className="mb-6">
            <Eyebrow>Send a message</Eyebrow>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">We reply within 24–48 hours.</h2>
          </div>

          {submitted ? (
            <div className="text-center py-12 flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-green-500/10 text-green-600 dark:text-green-400 flex items-center justify-center"><CheckCircle2 className="w-7 h-7" /></div>
              <h3 className="text-xl font-semibold">Message sent!</h3>
              <p className="text-muted-foreground max-w-xs">Thanks for reaching out — we&apos;ll get back to you shortly.</p>
              <Button className="rounded-full" onClick={() => setSubmitted(false)}>Send another</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={form.name} onChange={handleChange} placeholder="Your name" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" value={form.subject} onChange={handleChange} placeholder="What's this about?" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message" rows={6} value={form.message} onChange={handleChange} required
                  placeholder="Tell us what's on your mind…"
                  className="rounded-xl resize-none"
                />
              </div>
              <Button type="submit" disabled={loading} className="rounded-full w-full h-11 gap-1">
                {loading ? "Sending…" : "Send message"}
                {!loading && <ChevronRight className="w-4 h-4" />}
              </Button>
            </form>
          )}
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-border bg-card p-6 flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Clock className="w-5 h-5" /></div>
            <div>
              <h4 className="font-semibold">Response time</h4>
              <p className="text-sm text-muted-foreground mt-0.5">We reply to all inquiries within 24–48 hours.</p>
              <p className="text-sm mt-2 font-medium">Mon–Fri · 9am–6pm IST</p>
            </div>
          </div>

          <a href="mailto:support@orchardads.in" className="rounded-3xl border border-border bg-card p-6 flex gap-4 hover:border-primary/40 hover:-translate-y-0.5 transition-all">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Mail className="w-5 h-5" /></div>
            <div>
              <h4 className="font-semibold">Email us</h4>
              <p className="text-sm text-muted-foreground mt-0.5">Prefer email? Reach us directly.</p>
              <p className="text-sm mt-2 font-medium text-primary">support@orchardads.in</p>
            </div>
          </a>

          <div className="rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4"><MessageSquare className="w-4 h-4 text-primary" /><h3 className="font-semibold">Quick answers</h3></div>
            <div className="flex flex-col gap-4">
              {faqs.map((faq) => (
                <div key={faq.q}>
                  <p className="font-medium text-sm">{faq.q}</p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
