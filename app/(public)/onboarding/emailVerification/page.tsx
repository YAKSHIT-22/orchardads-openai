"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import ReCAPTCHA from "react-google-recaptcha";
import { useUserStore } from "@/stores/userStore";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { AuthShowcase } from "@/components/user/AuthShowcase";
import { BetaTag } from "@/components/brand/BetaTag";

const otpVerify = z.object({
  otp: z.string().length(6, "OTP must be 6 digits"),
});
type otpVerify = z.infer<typeof otpVerify>;

const Page = () => {
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [recaptchaToken, setrecaptchaToken] = useState<string | undefined>();
  const [isVerified, setIsVerified] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [timer, setTimer] = useState(30);
  const [isResending, setIsResending] = useState(false);

  const { email } = useUserStore();
  const router = useRouter();

  function handleCaptchaSubmission(token: string | null) {
    try {
      if (token) {
        setrecaptchaToken(token);
        setIsVerified(true);
      }
    } catch (e) {
      setrecaptchaToken(undefined);
      setIsVerified(false);
    }
  }

  const handleCaptchaChange = (token: string | null) => {
    handleCaptchaSubmission(token);
  };

  /**
   * reCAPTCHA tokens are single-use: once the server has verified one, sending
   * it again fails as `timeout-or-duplicate`. Reset the widget AND drop the
   * token so the next attempt carries a fresh one.
   */
  function handleExpired() {
    setIsVerified(false);
    setrecaptchaToken(undefined);
    recaptchaRef.current?.reset();
  }

  const {
    register: register1,
    handleSubmit: handleSubmit1,
    reset,
    formState: { errors: errors1 },
  } = useForm<otpVerify>({ resolver: zodResolver(otpVerify) });

  const useSendOtp = useMutation({
    mutationFn: async () => {
      const res = await api.get("/onboarding/sendotp");
    },
    onSuccess: () => {
      toast.success("OTP sent — check your email.");
      setIsResending(false);
      setTimer(30);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? "Failed to send OTP");
    },
  });

  const useVerifyOtp = useMutation({
    mutationFn: async (payload: {
      otp: string;
      recaptchaToken?: string;
    }) => {
      payload.recaptchaToken = recaptchaToken;
      const res = await api.post("/onboarding/verifyotp", payload);
    },
    onSuccess: () => {
      toast.success("Email verified! Let's connect your OpenAI Ads account…");
      router.push("/onboarding/connect");
    },
    onError: (err: any) => {
      handleExpired()
      reset();
      toast.error(
        err.response?.data?.error ?? "Failed to verify OTP"
      );
    },
  });

  const sendOtp = () => {
    setIsResending(true);
    useSendOtp.mutate();
  };

  const verifyOtpData = (data: otpVerify) => {
    useVerifyOtp.mutate(data);
  };

  useEffect(() => {
    let interval: any;
    if (step === 2 && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  return (
    <section className="w-full h-[100dvh] md:py-2 md:px-2 flex items-center justify-center">
      <div className="w-full h-full flex items-center justify-center p-2 sm:p-4 lg:p-6 md:flex-row flex-col gap-4">
        <div className="md:w-[50%] w-full h-full flex items-start flex-col gap-6 justify-start p-1 sm:p-4">
          <div className="flex items-start justify-start flex-col gap-2 w-full px-4">
            <div className="w-full h-full flex items-start justify-start gap-2">
              <img
                src="/assets/logo.svg"
                className="h-20 sm:h-22 lg:h-26 w-auto"
                alt="OrchardAds"
              />
              <BetaTag className="mt-1" />
            </div>

            {step === 1 && (
              <div className="flex flex-col gap-4 w-full items-start justify-start">
                <h1 className="text-lg font-semibold">Verify Your Email</h1>
                {!email ? (
                  <Skeleton className="w-full max-w-[320px] md:h-[32px] lg:h-[20px] rounded-[4px]" />
                ) : (
                  <p className="text-sm">
                    We will send a 6-digit OTP to your email{" "}
                    <strong>{email}</strong> to verify your identity.
                  </p>
                )}
                <Button
                  onClick={() => {
                    sendOtp();
                    setStep(2);
                  }}
                  variant="default"
                  className="mt-4 w-32"
                  disabled={useSendOtp.isPending}
                >
                  {useSendOtp.isPending ? (
                    <>
                      <Loader2 className="animate-spin mr-2 h-4 w-4" />
                      Sending OTP...
                    </>
                  ) : (
                    "Send OTP"
                  )}
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-4 w-full items-start justify-start">
                <h1 className="text-lg font-semibold">
                  Enter OTP received on <strong>{email}</strong>
                </h1>
                <p className="text-sm">
                  Didn&apos;t receive it? You can resend the OTP after 30 seconds.
                </p>
                <form
                  onSubmit={handleSubmit1(verifyOtpData)}
                  className="w-full h-full flex items-center justify-center"
                >
                  <div className="w-full h-full flex items-start justify-start flex-col gap-4">
                    <div className="w-full flex-col flex gap-2">
                      <Label htmlFor="otp" className="flex justify-between">
                        OTP
                        {errors1.otp && (
                          <p className="text-red-500 text-xs">
                            {errors1.otp.message}
                          </p>
                        )}
                      </Label>
                      <Input
                        id="otp"
                        {...register1("otp")}
                        maxLength={6}
                        placeholder="Enter OTP"
                        className="w-full"
                      />
                    </div>

                    <ReCAPTCHA
                      sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ""}
                      ref={recaptchaRef}
                      onChange={handleCaptchaChange}
                      onExpired={handleExpired}
                    />

                    <div className="flex items-center gap-4">
                      <Button
                        type="submit"
                        variant={"default"}
                        disabled={
                          !isVerified || isResending || useVerifyOtp.isPending
                        }
                        className="!rounded-lg text-sm !py-2 !px-3 mt-2"
                      >
                        {useVerifyOtp.isPending ? (
                          <>
                            <Loader2 className="animate-spin mr-2 h-4 w-4" />
                            Verifying…
                          </>
                        ) : (
                          "Verify & Continue"
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={sendOtp}
                        disabled={timer > 0 || useSendOtp.isPending}
                        className="!rounded-lg text-sm !py-2 !px-3 mt-2"
                      >
                        {timer > 0 ? `Resend in ${timer}s` : "Resend OTP"}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
        <div className="md:w-[50%] md:flex hidden h-full items-center justify-center p-4">
          <AuthShowcase />
        </div>
      </div>
    </section>
  );
};

export default Page;
