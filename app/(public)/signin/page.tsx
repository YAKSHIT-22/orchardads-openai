"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2, ShieldCheck, ArrowLeft, KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useRouter } from "next/navigation";
import ReCAPTCHA from "react-google-recaptcha";
import Link from "next/link";
import { useUserStore } from "@/stores/userStore";
import { AuthShowcase } from "@/components/user/AuthShowcase";
import { BetaTag } from "@/components/brand/BetaTag";

const userSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be 6+ characters"),
  recaptchaToken: z.string().optional(),
});

type userForm = z.infer<typeof userSchema>;

const Page = () => {
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [recaptchaToken, setrecaptchaToken] = useState<string | undefined>();
  const [isVerified, setIsVerified] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [twoFaRequired, setTwoFaRequired] = useState(false);
  const [code, setCode] = useState("");
  // 2FA method: authenticator app (TOTP) or an emailed code. Email is the
  // baseline factor for everyone; `hasTotp` reflects whether the account also
  // set up an authenticator (then the user gets to choose).
  const [otpMethod, setOtpMethod] = useState<"totp" | "email">("email");
  const [hasTotp, setHasTotp] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const credsRef = useRef<userForm | null>(null);
  const { setUser } = useUserStore();
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
  } = useForm<userForm>({ resolver: zodResolver(userSchema) });

  const userLoginMutation = useMutation({
    mutationFn: async (data: userForm & { code?: string }) => {
      data.recaptchaToken = recaptchaToken;
      const res = await axios.post("/api/onboarding/signin", data);
      return res.data;
    },
    onSuccess: async (data) => {
      // Password correct but a second factor is still required.
      if (data?.twoFactorRequired) {
        enter2fa(data.methods);
        return;
      }
      setUser(data.name, data.userId, data.email);
      router.push("/tools/dashboard");
      toast.success("Signed in successfully");
      reset();
    },
    onError: (e) => {
      const serverMsg = axios.isAxiosError(e) ? e.response?.data?.error : undefined;
      if (axios.isAxiosError(e) && e.response?.data?.twoFactorRequired) {
        // A wrong code came back — stay on the 2FA step, show the real reason.
        // Deliberately no captcha reset: the 2FA step doesn't send one.
        setTwoFaRequired(true);
        toast.error(serverMsg || "Invalid authentication code");
        return;
      }
      // Prefer the server's actual message (invalid credentials, rate-limit with
      // retry time, missing fields…); fall back only when there isn't one.
      // A credential-step failure spent the token — force a fresh tick.
      handleExpired();
      if (serverMsg) {
        toast.error(serverMsg);
      } else if (axios.isAxiosError(e) && e.response?.status === 401) {
        toast.error("Invalid email or password.");
      } else {
        toast.error("Something went wrong.");
      }
    },
  });

  const onSubmitUserData = (data: userForm) => {
    credsRef.current = data;
    userLoginMutation.mutate(data);
  };

  const verifyCode = () => {
    if (!credsRef.current) return;
    userLoginMutation.mutate({ ...credsRef.current, code: code.trim() });
  };

  const sendEmailOtp = useMutation({
    mutationFn: async () => {
      if (!credsRef.current) throw new Error("Missing credentials");
      const res = await axios.post("/api/onboarding/2fa-send-otp", {
        email: credsRef.current.email,
        password: credsRef.current.password,
      });
      return res.data;
    },
    onSuccess: () => {
      setEmailSent(true);
      setCode("");
      toast.success("Code sent — check your email");
    },
    onError: (e) => {
      const msg = axios.isAxiosError(e) && e.response?.data?.error;
      toast.error(msg || "Couldn't send the code. Try again.");
    },
  });

  const chooseMethod = (m: "totp" | "email") => {
    setOtpMethod(m);
    setCode("");
    setEmailSent(false);
  };

  // Enter the second-factor step. `methods` from the server tells us whether the
  // account has an authenticator (choice) or email only (auto-send the code).
  const enter2fa = (methods?: string[]) => {
    const totp = Array.isArray(methods) && methods.includes("totp");
    setHasTotp(totp);
    setTwoFaRequired(true);
    if (totp) {
      // Let the user choose; default to the authenticator.
      setOtpMethod("totp");
    } else {
      // Email is the only factor — send the code straight away.
      setOtpMethod("email");
      sendEmailOtp.mutate();
    }
  };

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
                Welcome back to OrchardAds
              </h1>
              <p className="text-xs xs:text-sm lg:text-base">
                Sign in to diagnose, optimize and safely apply changes to your OpenAI Ads
                campaigns — all in one dashboard.
              </p>
            </div>
          </div>
          {twoFaRequired ? (
            <div className="w-full h-full flex items-start justify-center px-4">
              <div className="w-full flex flex-col gap-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="w-[18px] h-[18px]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Two-factor authentication</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {otpMethod === "totp"
                        ? "Enter the 6-digit code from your authenticator app (or a backup code)."
                        : "We'll email you a 6-digit code to finish signing in."}
                    </p>
                  </div>
                </div>

                {/* Method choice — only when the account also has an authenticator */}
                {hasTotp && (
                  <div className="inline-flex self-start rounded-lg border p-0.5 text-sm">
                    <button
                      type="button"
                      onClick={() => chooseMethod("totp")}
                      className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors ${otpMethod === "totp" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <KeyRound className="w-3.5 h-3.5" /> Authenticator app
                    </button>
                    <button
                      type="button"
                      onClick={() => chooseMethod("email")}
                      className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors ${otpMethod === "email" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <Mail className="w-3.5 h-3.5" /> Email me a code
                    </button>
                  </div>
                )}

                {otpMethod === "email" && !emailSent ? (
                  <Button
                    type="button"
                    onClick={() => sendEmailOtp.mutate()}
                    disabled={sendEmailOtp.isPending}
                    className="w-full !rounded-lg text-sm !py-2 !px-3"
                  >
                    {sendEmailOtp.isPending && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                    Send code to my email
                  </Button>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="totp">{otpMethod === "email" ? "Email code" : "Authentication code"}</Label>
                      <Input
                        id="totp"
                        inputMode="numeric"
                        autoFocus
                        placeholder="123456"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") verifyCode(); }}
                        className="tracking-[0.3em] text-center font-mono"
                      />
                      {otpMethod === "email" && (
                        <button
                          type="button"
                          onClick={() => sendEmailOtp.mutate()}
                          disabled={sendEmailOtp.isPending}
                          className="text-xs text-muted-foreground hover:text-foreground self-start"
                        >
                          {sendEmailOtp.isPending ? "Sending…" : "Resend code"}
                        </button>
                      )}
                    </div>
                    <Button
                      type="button"
                      onClick={verifyCode}
                      disabled={userLoginMutation.isPending || code.trim().length < 6}
                      className="w-full !rounded-lg text-sm !py-2 !px-3"
                    >
                      {userLoginMutation.isPending && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                      Verify &amp; sign in
                    </Button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => { setTwoFaRequired(false); setCode(""); setOtpMethod("email"); setHasTotp(false); setEmailSent(false); }}
                  className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-center"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                </button>
              </div>
            </div>
          ) : (
          <form
            onSubmit={handleSubmit1(onSubmitUserData)}
            className="w-full h-full flex items-center justify-center px-4"
          >
            <div className="w-full h-full flex items-start justify-start flex-col gap-4">
              <div className="w-full flex-col flex gap-2">
                <Label htmlFor="email" className="flex justify-between">
                  Email{" "}
                  {errors1.email && (
                    <p className="text-red-500 text-xs">
                      {errors1.email.message}
                    </p>
                  )}
                </Label>
                <Input
                  type="email"
                  id="email"
                  {...register1("email")}
                  placeholder="Enter your email"
                />
              </div>
              <div className="w-full flex-col flex gap-2">
                <Label htmlFor="password" className="flex justify-between">
                  Password{" "}
                  {errors1.password && (
                    <p className="text-red-500 text-xs text-right">
                      {errors1.password.message}
                    </p>
                  )}
                </Label>
                <div className="relative w-full">
                  <Input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    placeholder="Enter your password"
                    className="w-full"
                    {...register1("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary hover:underline self-end"
                >
                  Forgot password?
                </Link>
              </div>
              <ReCAPTCHA
                sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ""}
                ref={recaptchaRef}
                onChange={handleCaptchaChange}
                onExpired={handleExpired}
                className="place-self-center"
              />
              <Button
                type="submit"
                variant={"default"}
                disabled={!isVerified || userLoginMutation.isPending}
                className="w-full !rounded-lg text-sm !py-2 !px-3 mt-2"
              >
                {userLoginMutation.isPending && (
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                )}
                {userLoginMutation.isPending
                  ? "Signing in…"
                  : "Sign in"}
              </Button>
              <div className="w-full flex flex-col gap-2 items-center justify-center">
                <h1 className="text-zinc-400 flex items-center justify-center gap-2">
                  <div className="w-6 h-[1px] bg-zinc-400"></div> OR{" "}
                  <div className="w-6 h-[1px] bg-zinc-400"></div>
                </h1>
                <h1 className="flex items-center justify-center gap-1 text-sm">
                  Don&apos;t have an account?{" "}
                  <Link
                    href="/signup"
                    className="text-primary hover:underline transition-colors duration-200"
                  >
                    Sign Up
                  </Link>
                </h1>
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
