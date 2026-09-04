"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { AuthShowcase } from "@/components/user/AuthShowcase";
import { BetaTag } from "@/components/brand/BetaTag";

const forgotSchema = z.object({
  email: z.string().email("Invalid email"),
});

type ForgotForm = z.infer<typeof forgotSchema>;

const Page = () => {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({ resolver: zodResolver(forgotSchema) });

  const forgotMutation = useMutation({
    mutationFn: async (data: ForgotForm) => {
      const res = await axios.post("/api/onboarding/forgot-password", data);
      return res.data;
    },
    onSuccess: () => setSent(true),
    onError: (e) => {
      const serverMsg = axios.isAxiosError(e) ? e.response?.data?.error : undefined;
      if (axios.isAxiosError(e) && e.response?.status === 429) {
        toast.error("Too many requests, try again later.");
      } else if (serverMsg) {
        toast.error(serverMsg);
      } else {
        toast.error("Something went wrong.");
      }
    },
  });

  const onSubmit = (data: ForgotForm) => forgotMutation.mutate(data);

  return (
    <section className="w-full h-[100dvh] md:py-2 md:px-2 flex items-center justify-center">
      <div className="w-full h-full flex items-center justify-center p-2 sm:p-4 lg:p-6 md:flex-row flex-col gap-4">
        <div className="md:w-[50%] w-full h-full flex items-center flex-col gap-6 justify-center p-1 sm:p-4">
          <div className="flex items-center justify-center flex-col gap-2 w-full px-4">
            <div className="w-full h-full flex items-start justify-start gap-2">
              <img
                src="/assets/logo.svg"
                className="h-20 sm:h-22 lg:h-26 w-auto"
                alt="OrchardAds"
              />
              <BetaTag className="mt-1" />
            </div>
            <div className="flex items-start w-full justify-start flex-col gap-2">
              <h1 className="text-base xs:text-lg md:text-lg lg:text-xl">
                Forgot your password?
              </h1>
              <p className="text-xs xs:text-sm lg:text-base">
                Enter the email you signed up with and we&apos;ll send you a
                link to reset it.
              </p>
            </div>
          </div>

          {sent ? (
            <div className="w-full h-full flex items-start justify-center px-4">
              <div className="w-full flex flex-col gap-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <MailCheck className="w-[18px] h-[18px]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">
                      Check your inbox
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      If that email is registered, a reset link is on its way —
                      check your inbox. The link expires soon, so use it while
                      it&apos;s fresh.
                    </p>
                  </div>
                </div>
                <Link
                  href="/signin"
                  className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-center"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="w-full h-full flex items-center justify-center px-4"
            >
              <div className="w-full h-full flex items-start justify-start flex-col gap-4">
                <div className="w-full flex-col flex gap-2">
                  <Label htmlFor="email" className="flex justify-between">
                    Email{" "}
                    {errors.email && (
                      <p className="text-red-500 text-xs">
                        {errors.email.message}
                      </p>
                    )}
                  </Label>
                  <Input
                    type="email"
                    id="email"
                    {...register("email")}
                    placeholder="Enter your email"
                  />
                </div>
                <Button
                  type="submit"
                  variant={"default"}
                  disabled={forgotMutation.isPending}
                  className="w-full !rounded-lg text-sm !py-2 !px-3 mt-2"
                >
                  {forgotMutation.isPending && (
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  )}
                  {forgotMutation.isPending ? "Sending…" : "Send reset link"}
                </Button>
                <div className="w-full flex items-center justify-center">
                  <Link
                    href="/signin"
                    className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                  </Link>
                </div>
              </div>
            </form>
          )}
        </div>
        <div className="md:w-[50%] md:flex hidden h-full items-center justify-center p-4">
          <AuthShowcase />
        </div>
      </div>
    </section>
  );
};

export default Page;
