"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-[100dvh] bg-zinc-50 p-4">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-zinc-800">404</h1>
        <p className="text-lg text-zinc-600">
          Oops! The page you’re looking for doesn’t exist.
        </p>
        <div className="mx-auto w-32 h-32">
          <svg
            className="w-full h-full text-zinc-300"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M11 15h2v2h-2zM11 7h2v6h-2z" />
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10
                     10-4.48 10-10S17.52 2 12 2zm0 18
                     c-4.41 0-8-3.59-8-8s3.59-8 8-8
                     8 3.59 8 8-3.59 8-8 8z" />
          </svg>
        </div>
        <Button asChild>
          <Link href="/tools/dashboard" className="mt-4">
            Go back home
          </Link>
        </Button>
      </div>
    </div>
  );
}
