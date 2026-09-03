"use client";

import { Bell, Key, Loader2, Lock, LogOut, User, Settings, AlertTriangle } from "lucide-react";
import { adsErrorToast } from "@/lib/openai/errorToast";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, ReactNode, ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { adAccountStore, type ConnectionSummary } from "@/stores/adAccountStore";
import { menuItems } from "@/utils/constant";
import { useBilling } from "@/lib/billing/useEntitlements";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { AlertsTray } from "@/components/alerts/AlertsTray";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useUserStore } from "@/stores/userStore";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [toolVisible, setToolVisible] = useState(false);
  const primaryRef = useRef<HTMLElement>(null);
  const toolsRef = useRef<HTMLElement>(null);
  const router = useRouter();

  const { adAccountId, connections, selectedIndex, setConnections, setSelectedIndex } =
    adAccountStore();
  const { name } = useUserStore();
  const [alertsTrayOpen, setAlertsTrayOpen] = useState(false);

  // Unread Orchard Watch events — drives the bell badge. The tray and the
  // alerts page invalidate this key after read/snooze/dismiss actions.
  const { data: unreadAlerts = 0 } = useQuery<number>({
    queryKey: ["alerts-unread-count", adAccountId],
    enabled: !!adAccountId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await api.get("/alerts/events/count", { params: { adAccountId } });
      return Number(res.data?.count) || 0;
    },
  });

  const billing = useBilling();

  /**
   * Plan gating for the nav.
   *
   * Un-entitled tools are shown LOCKED rather than hidden. Hiding them makes the
   * product look smaller than it is and gives the user no way to discover what
   * upgrading buys; a lock with a destination does both jobs. While billing is
   * loading everything is treated as available, so paying users never see a
   * flash of padlocks on each page load.
   */
  const has = (feature?: string) => {
    if (!feature) return true;
    if (billing.isLoading || !billing.data) return true;
    return billing.data.features.includes(feature as never);
  };

  const visibleMenuItems = menuItems;

  /**
   * Load the user's connected ad accounts.
   *
   * There is no account-list endpoint to call: each OpenAI Ads API key is
   * scoped to exactly one ad account, so the account list IS the list of keys
   * the user has pasted. It is fetched rather than cached so a key that has
   * since been revoked shows as broken instead of appearing healthy.
   */
  const userACL = useQuery({
    queryKey: ["connections"],
    queryFn: async () => {
      const res = await api.get("/connections");
      return (res.data?.data ?? []) as ConnectionSummary[];
    },
  });

  useEffect(() => {
    if (userACL.data) setConnections(userACL.data);
  }, [userACL.data, setConnections]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (
        toolVisible &&
        primaryRef.current &&
        toolsRef.current &&
        !primaryRef.current.contains(e.target as Node) &&
        !toolsRef.current.contains(e.target as Node)
      ) {
        setActiveMenu(null);
        setToolVisible(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveMenu(null);
        setToolVisible(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [toolVisible]);


  useEffect(() => {
    if (pathname) {
      setTimeout(() => {
      setToolVisible(false)
      }, 500);
    }
   }, [pathname]);

  function handlePrimaryClick(label: string) {
    if (activeMenu === label) {
      setActiveMenu(null);
      setToolVisible(false);
    } else {
      setActiveMenu(label);
      setToolVisible(true);
    }
  }

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await api.get("/onboarding/logout");
    },
    onSuccess: () => {
      toast.success("Logged out successfully");
      // Clear everything: cached campaigns, ad groups and the selected account
      // must not survive a logout on a shared machine.
      sessionStorage.clear();
      router.push("/signin");
    },
    onError: () => {
      console.error("Logout failed");
    },
  });

  return (
    // h-dvh (not h-screen): Safari's 100vh includes the area behind its
    // collapsing toolbars, which left the bottom of the page hidden under a
    // translucent bar. 100dvh tracks the actually-visible viewport.
    <div className="flex h-dvh w-full overflow-hidden relative">
      <aside
  ref={primaryRef}
  className="w-36 bg-background border-r border-border text-foreground flex flex-col gap-2 py-4 px-3 z-20"
>
  <img
    src="/assets/logo.svg"
    alt="logo"
    className="mb-4 w-full h-auto"
  />
  {/* Scrollable so short viewports can still reach every item. */}
  <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hidden flex flex-col gap-2">
    {visibleMenuItems.map((item) => {
      const isActiveSubmenu = item.children?.some(
        (child) => pathname === child.href
      );

      // A parent is locked only when EVERY child is locked — otherwise the
      // group still leads somewhere useful.
      const groupLocked =
        !!item.children?.length && item.children.every((c) => !has(c.feature));

      if (item.children && item.children.length > 0) {
        return (
          <button
            key={item.label}
            onClick={() => (groupLocked ? router.push("/tools/billing") : handlePrimaryClick(item.label))}
            className={cn(
              "flex flex-col items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors",
              (activeMenu === item.label && toolVisible) || isActiveSubmenu
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground"
            )}
          >
            {groupLocked ? <Lock size={18} /> : item.icon}
            <span className="text-xs text-center leading-tight">{item.label}</span>
          </button>
        );
      } else {
        const locked = !has(item.feature);
        return (
          <Link
            key={item.label}
            href={locked ? "/tools/billing" : item.href!}
            title={locked ? `${item.label} isn't on your plan` : undefined}
            onClick={() => {
              setActiveMenu(null);
              setToolVisible(false);
            }}
            className={cn(
              "flex flex-col items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors",
              locked && "opacity-50",
              pathname === item.href
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground"
            )}
          >
            {locked ? <Lock size={18} /> : item.icon}
            <span className="text-xs text-center leading-tight">{item.label}</span>
          </Link>
        );
      }
    })}
  </nav>
</aside>

<aside
  ref={toolsRef}
  className={cn(
    "absolute top-0 left-36 h-full w-64 bg-background border-r border-border text-foreground transition-all duration-200 z-10",
    toolVisible
      ? "translate-x-0 opacity-100"
      : "-translate-x-full opacity-0"
  )}
>
  <div className="flex flex-col py-4 px-3 h-full">
    {/* Header with accent left border */}
    <div className="border-l-4 border-primary pl-3 mb-5">
      <h3 className="font-semibold text-lg text-foreground">{activeMenu}</h3>
    </div>

    {/* Scrollable tool list — the panel header above stays pinned. */}
    <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hidden flex flex-col gap-1 pb-2">
      {menuItems
        .find((i) => i.label === activeMenu)
        ?.children?.map((tool) => {
          const locked = !has(tool.feature);
          return (
            <Link
              key={tool.href}
              href={locked ? "/tools/billing" : tool.href!}
              title={locked ? `${tool.label} isn't on your plan` : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors text-sm",
                locked && "opacity-50",
                pathname === tool.href
                  ? "bg-primary/10 text-primary font-semibold border-l-2 border-primary pl-[10px]"
                  : "text-muted-foreground"
              )}
            >
              {locked ? <Lock size={16} /> : tool.icon}
              <span className="flex-1">{tool.label}</span>
              {locked && <span className="text-[10px] uppercase tracking-wide">Upgrade</span>}
            </Link>
          );
        })}
    </nav>
  </div>
</aside>
      {/* min-h-0 (not h-[100dvh]): the column must size to the flex parent.
          Giving it its own 100dvh height made <main> (flex-1 + h-full) resolve
          to the full viewport height while sitting below the 56px header, so
          in Safari the last ~56px of scroll content was clipped/hidden. */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <header className="h-14 px-4 md:px-6 bg-background border-b border-border flex items-center justify-between gap-2">
          <div className="font-semibold text-foreground text-sm min-w-0">
            {userACL.isPending ? (
              <Skeleton className="w-48 h-6 rounded-md" />
            ) : userACL.isError || !connections.length ? (
              <Link
                href="/onboarding/connect"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700"
              >
                <AlertTriangle className="h-4 w-4" />
                {userACL.isError ? "Couldn\u2019t load your ad accounts" : "No ad account connected \u2014 connect one"}
              </Link>
            ) : (
              <Select
                value={String(selectedIndex)}
                onValueChange={(val) => setSelectedIndex(Number(val))}
              >
                <SelectTrigger className="w-max">
                  <SelectValue placeholder="Select an ad account\u2026" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((conn, idx) => (
                    <SelectItem key={conn.id} value={String(idx)}>
                      {conn.label || conn.adAccountName || conn.adAccountId}
                      {conn.status !== "ACTIVE" ? " \u2014 needs attention" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAlertsTrayOpen(true)}
            title="Triggered alerts"
            aria-label={unreadAlerts > 0 ? `Triggered alerts (${unreadAlerts} unread)` : "Triggered alerts"}
            className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Bell className="h-4 w-4" />
            {unreadAlerts > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-rose-600 text-white text-[9px] font-semibold flex items-center justify-center leading-none pointer-events-none">
                {unreadAlerts > 9 ? "9+" : unreadAlerts}
              </span>
            )}
          </button>
          <Link
            href="/tools/settings"
            title="Settings"
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarFallback>{name && name[0]}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-max">
              <DropdownMenuItem asChild>
                <Link href="/tools/user-profile">
                  <User className="mr-2 h-4 w-4" /> User Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/tools/change-keys">
                  <Key className="mr-2 h-4 w-4" /> Change Ads Account Keys
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <button
                  className="w-full flex items-center"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                >
                  {logoutMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-2 h-4 w-4" />
                  )}
                  Logout
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </header>

        <TrialBanner />

        <AlertsTray open={alertsTrayOpen} onOpenChange={setAlertsTrayOpen} />

        {/* The one scroll container: exact remaining height (flex-1 + min-h-0),
            no rubber-band chaining, and safe-area padding so the last row is
            never hidden behind Safari's translucent bottom bar. */}
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-zinc-50 pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>
      </div>
    </div>
  );
}
