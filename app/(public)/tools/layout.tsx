"use client";

import { Bell, Key, Loader2, Lock, LogOut, User, Settings, AlertTriangle, ChevronDown, PanelLeft } from "lucide-react";
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
import { BetaTag } from "@/components/brand/BetaTag";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  /** Icon-only rail, remembered per browser. */
  const [navCollapsed, setNavCollapsed] = useState(false);
  useEffect(() => {
    // localStorage can throw in a private window; a nav preference is never
    // worth failing a page render over.
    try {
      setNavCollapsed(localStorage.getItem("oa:nav-collapsed") === "1");
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("oa:nav-collapsed", navCollapsed ? "1" : "0");
    } catch {}
  }, [navCollapsed]);
  const primaryRef = useRef<HTMLElement>(null);
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

  // Escape closes an expanded group. There is no outside-click handler any
  // more: the group expands INSIDE the sidebar rather than overlaying the page,
  // so leaving it open costs the reader nothing and closing it on every stray
  // click was the more annoying behaviour.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveMenu(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Keep the group containing the current page open, so a deep link lands with
  // its section already expanded rather than the sidebar looking unrelated to
  // where you are.
  useEffect(() => {
    const owner = menuItems.find((m) => m.children?.some((c) => c.href === pathname));
    if (owner) setActiveMenu(owner.label);
  }, [pathname]);

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
      {/*
        One sidebar, not a rail plus a slide-out panel.
        The old shape put a w-36 icon rail beside an absolutely-positioned w-64
        panel: opening a group OVERLAID the page, so you lost sight of the thing
        you were navigating away from, and seventeen stacked icon-over-label
        entries at that width were a list to scan rather than read.
        Ads Manager uses a single sidebar with inline groups and section
        headings; this is the same, plus a collapse for narrow screens.
      */}
      <aside
        ref={primaryRef}
        className={cn(
          "shrink-0 bg-sidebar border-r border-border text-foreground flex flex-col z-20 transition-[width] duration-200",
          navCollapsed ? "w-[3.75rem]" : "w-56"
        )}
      >
        {/*
          The mark gets the full rail width.
          It was `h-6 w-auto` sharing a row with the Beta badge, so in a 224px
          sidebar it rendered as a small logo hugging the left edge with dead
          space beside it. The logo is 268x111 (~2.42:1), so anything sharing
          its row costs width fast — the badge now sits on its own line and the
          mark spans the column.
        */}
        <div className="px-3 py-3 min-w-0">
          {navCollapsed ? (
            <span className="block text-center text-sm font-semibold">OA</span>
          ) : (
            <div className="flex flex-col gap-1.5 min-w-0">
              <img src="/assets/logo.svg" alt="OrchardAds" className="w-full h-auto" />
              <BetaTag className="self-start" />
            </div>
          )}
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hidden flex flex-col gap-0.5 px-2 pb-3">
          {visibleMenuItems.map((item, i) => {
            const prevSection = i > 0 ? visibleMenuItems[i - 1].section : undefined;
            const showHeading = !navCollapsed && item.section && item.section !== prevSection;

            // A group is locked only when EVERY child is locked — otherwise it
            // still leads somewhere useful.
            const groupLocked =
              !!item.children?.length && item.children.every((c) => !has(c.feature));
            const locked = item.children?.length ? groupLocked : !has(item.feature);
            const expanded = activeMenu === item.label;
            const childActive = item.children?.some((c) => pathname === c.href);

            const row =
              "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors";
            const on = "bg-accent text-foreground font-medium";
            const off = "text-muted-foreground hover:bg-accent/60 hover:text-foreground";

            return (
              <div key={item.label} className="flex flex-col">
                {showHeading && (
                  <div className="px-2.5 pt-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {item.section}
                  </div>
                )}

                {item.children?.length ? (
                  <>
                    <button
                      onClick={() =>
                        groupLocked
                          ? router.push("/tools/billing")
                          : setActiveMenu(expanded ? null : item.label)
                      }
                      aria-expanded={expanded}
                      title={navCollapsed ? item.label : undefined}
                      className={cn(row, expanded || childActive ? on : off, locked && "opacity-60")}
                    >
                      <span className="shrink-0">{locked ? <Lock size={18} /> : item.icon}</span>
                      {!navCollapsed && (
                        <>
                          <span className="truncate flex-1 text-left">{item.label}</span>
                          <ChevronDown
                            size={14}
                            className={cn("shrink-0 transition-transform", expanded && "rotate-180")}
                          />
                        </>
                      )}
                    </button>

                    {/* Inline, so the page underneath is never covered. */}
                    {expanded && !navCollapsed && (
                      <div className="ml-3 pl-2 border-l border-border flex flex-col gap-0.5 mt-0.5">
                        {item.children.map((child) => {
                          const childLocked = !has(child.feature);
                          return (
                            <Link
                              key={child.label}
                              href={childLocked ? "/tools/billing" : child.href!}
                              title={childLocked ? `${child.label} isn't on your plan` : undefined}
                              className={cn(
                                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                                pathname === child.href ? on : off,
                                childLocked && "opacity-60"
                              )}
                            >
                              <span className="shrink-0">
                                {childLocked ? <Lock size={14} /> : child.icon}
                              </span>
                              <span className="truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    href={locked ? "/tools/billing" : item.href!}
                    title={navCollapsed ? item.label : locked ? `${item.label} isn't on your plan` : undefined}
                    onClick={() => setActiveMenu(null)}
                    className={cn(row, pathname === item.href ? on : off, locked && "opacity-60")}
                  >
                    <span className="shrink-0">{locked ? <Lock size={18} /> : item.icon}</span>
                    {!navCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>

        <button
          onClick={() => setNavCollapsed((v) => !v)}
          className="flex items-center gap-2.5 px-4 py-3 border-t border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
          title={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft size={18} className="shrink-0" />
          {!navCollapsed && <span>Collapse</span>}
        </button>
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
