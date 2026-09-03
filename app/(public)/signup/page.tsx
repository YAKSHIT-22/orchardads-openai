"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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

const userSchema = z.object({
  name: z.string().min(2, "Name is required"),
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

  function handleExpired() {
    setIsVerified(false);
    recaptchaRef.current?.reset();
  }

  const {
    register: register1,
    handleSubmit: handleSubmit1,
    reset,
    formState: { errors: errors1 },
  } = useForm<userForm>({ resolver: zodResolver(userSchema) });

  const userMutation = useMutation({
    mutationFn: async (data: userForm) => {
      data.recaptchaToken = recaptchaToken;
      const res = await axios.post("/api/onboarding/createuser", data);
      return res.data;
    },
    onSuccess: async (data) => {
      setUser(data.name, data.userId, data.email);
      router.push("/onboarding/emailVerification");
      toast.success("Account created! Redirecting to verification…");
      reset();
    },
    onError: (e) => {
      const serverMsg = axios.isAxiosError(e) ? e.response?.data?.error : undefined;
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        toast.error("Email already exists. Please login.");
      } else if (serverMsg) {
        // Surface real validation errors (password length, invalid email, captcha…).
        toast.error(serverMsg);
      } else {
        toast.error("Something went wrong.");
      }
    },
  });

  const onSubmitUserData = (data: userForm) => {
    userMutation.mutate(data);
  };

  return (
    <section className="w-full h-[100dvh] md:py-2 md:px-2 flex items-center justify-center">
      <div className="w-full h-full flex items-center justify-center p-2 sm:p-4 lg:p-6 md:flex-row flex-col gap-4">
        <div className="md:w-[50%] w-full h-full flex items-center flex-col gap-6 justify-center p-1 sm:p-4">
          <div className="flex items-center justify-center flex-col gap-2 w-full px-4">
            <div className="w-full h-full flex items-start justify-start">
              <img
                src="/assets/logo.svg"
                className="h-20 sm:h-22 lg:h-26 w-auto"
                alt="logo"
              />
            </div>
            <div className="flex items-start w-full justify-start flex-col gap-2">
              <h1 className="text-base xs:text-lg md:text-lg lg:text-xl">
                Get started with OrchardAds
              </h1>
              <p className="text-xs xs:text-sm lg:text-base">
                Find out why your ChatGPT Ads aren't delivering — and fix it
                campaigns — all in one dashboard. Sign up to launch smarter ads
                today.
              </p>
            </div>
          </div>
          <form
            onSubmit={handleSubmit1(onSubmitUserData)}
            className="w-full h-full flex items-center justify-center px-4"
          >
            <div className="w-full h-full flex items-start justify-start flex-col gap-4">
              <div className="w-full flex-col flex gap-2">
                <Label htmlFor="name" className="flex justify-between">
                  Name{" "}
                  {errors1.name && (
                    <p className="text-red-500 text-xs">
                      {errors1.name.message}
                    </p>
                  )}
                </Label>
                <Input
                  id="name"
                  {...register1("name")}
                  placeholder="Enter your name"
                />
              </div>
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
                disabled={!isVerified || userMutation.isPending}
                className="w-full !rounded-lg text-sm !py-2 !px-3 mt-2"
              >
                {userMutation.isPending && (
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                )}
                {userMutation.isPending
                  ? "Creating account…"
                  : "Continue to email verification"}
              </Button>
              <div className="w-full flex flex-col gap-2 items-center justify-center">
                <h1 className="text-zinc-400 flex items-center justify-center gap-2">
                  <div className="w-6 h-[1px] bg-zinc-400"></div> OR{" "}
                  <div className="w-6 h-[1px] bg-zinc-400"></div>
                </h1>
                <h1 className="flex items-center justify-center gap-1 text-sm">
                  Already have an account?{" "}
                  <Link
                    href="/signin"
                    className="text-primary hover:underline transition-colors duration-200"
                  >
                    Sign In
                  </Link>
                </h1>
              </div>
            </div>
          </form>
        </div>
        <div className="md:w-[50%] md:flex hidden h-full items-center justify-center p-4">
          <AuthShowcase />
        </div>
      </div>
    </section>
  );
};

export default Page;
