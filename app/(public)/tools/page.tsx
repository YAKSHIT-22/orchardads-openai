"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function ToolsIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.push("/tools/dashboard");
  }, [router]);

  return (
    <div className="w-full flex h-[100dvh] items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
        <p className="text-foreground/80">Redirecting to Dashboard…</p>
      </div>
    </div>
  );
}
