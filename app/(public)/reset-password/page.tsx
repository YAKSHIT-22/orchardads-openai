"use client";

import { Suspense, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2, LinkIcon, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShowcase } from "@/components/user/AuthShowcase";
import { BetaTag } from "@/components/brand/BetaTag";

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be 8+ characters")
      .max(100, "Password must be 100 characters or fewer"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ResetForm = z.infer<typeof resetSchema>;

function InvalidLinkState({ message }: { message: string }) {
  return (
    <div className="w-full h-full flex items-start justify-center px-4">
      <div className="w-full flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0 mt-0.5">
          <TriangleAlert className="w-[18px] h-[18px]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            This reset link isn&apos;t valid
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{message}</p>
        </div>
      </div>
      <Link
        href="/forgot-password"
        className="text-sm text-primary hover:underline inline-flex items-center gap-1.5 self-center"
      >
        <LinkIcon className="w-3.5 h-3.5" /> Request a new reset link
      </Link>
      </div>
    </div>
  );
}

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) });

  const resetMutation = useMutation({
    mutationFn: async (data: ResetForm) => {
      const res = await axios.post("/api/onboarding/reset-password", {
        token,
        password: data.password,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Password reset — sign in with your new password");
      router.push("/signin");
    },
    onError: (e) => {
      if (axios.isAxiosError(e) && e.response?.status === 400) {
        setTokenError(
          e.response.data?.error ||
            "This reset link is invalid or has expired."
        );
      } else {
        toast.error("Something went wrong.");
      }
    },
  });

  const onSubmit = (data: ResetForm) => resetMutation.mutate(data);

  if (!token) {
    return (
      <InvalidLinkState message="The link is missing its reset token. Open the link from your email again, or request a new one." />
    );
  }

  if (tokenError) {
    return <InvalidLinkState message={tokenError} />;
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="w-full h-full flex items-center justify-center px-4"
    >
      <div className="w-full h-full flex items-start justify-start flex-col gap-4">
        <div className="w-full flex-col flex gap-2">
          <Label htmlFor="password" className="flex justify-between">
            New password{" "}
            {errors.password && (
              <p className="text-red-500 text-xs text-right">
                {errors.password.message}
              </p>
            )}
          </Label>
          <div className="relative w-full">
            <Input
              type={showPassword ? "text" : "password"}
              id="password"
              placeholder="Enter your new password"
              className="w-full"
              {...register("password")}
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
        <div className="w-full flex-col flex gap-2">
          <Label htmlFor="confirmPassword" className="flex justify-between">
            Confirm password{" "}
            {errors.confirmPassword && (
              <p className="text-red-500 text-xs text-right">
                {errors.confirmPassword.message}
              </p>
            )}
          </Label>
          <div className="relative w-full">
            <Input
              type={showConfirm ? "text" : "password"}
              id="confirmPassword"
              placeholder="Re-enter your new password"
              className="w-full"
              {...register("confirmPassword")}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showConfirm ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        <Button
          type="submit"
          variant={"default"}
          disabled={resetMutation.isPending}
          className="w-full !rounded-lg text-sm !py-2 !px-3 mt-2"
        >
          {resetMutation.isPending && (
            <Loader2 className="animate-spin mr-2 h-4 w-4" />
          )}
          {resetMutation.isPending ? "Resetting…" : "Reset password"}
        </Button>
        <div className="w-full flex items-center justify-center">
          <Link
            href="/signin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </form>
  );
}

const Page = () => {
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
                Choose a new password
              </h1>
              <p className="text-xs xs:text-sm lg:text-base">
                Set a new password for your OrchardAds account. It must be
                8–100 characters long.
              </p>
            </div>
          </div>
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <ResetPasswordInner />
          </Suspense>
        </div>
        <div className="md:w-[50%] md:flex hidden h-full items-center justify-center p-4">
          <AuthShowcase />
        </div>
      </div>
    </section>
  );
};

export default Page;
