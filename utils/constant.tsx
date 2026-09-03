import {
  Activity,
  BarChart2,
  BellRing,
  CalendarDays,
  ClipboardCheck,
  DollarSign,
  Gauge,
  Layers,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Megaphone,
  Plane,
  ScrollText,
  Share2,
  ShieldMinus,
  Sparkles,
  Stethoscope,
  Tags,
  TrendingUp,
} from "lucide-react";

/**
 * Primary navigation.
 *
 * Ported from the Apple Search Ads build, with the keyword-shaped tools removed:
 * the OpenAI Ads API has no keywords, no search terms and no match types, so
 * N-Gram Analyzer and Keyword Harvest have no analogue and are gone rather than
 * left as dead pages. What replaces them is what this platform actually exposes:
 * typed serving-issue codes and ad-review reasons, which is why Serving Doctor
 * and Review Doctor sit near the top.
 *
 * See docs/reference/handyads-port-map.md for the full mapping.
 */

export const menuItems = [
  {
    label: "Dashboard",
    icon: <LayoutDashboard size={18} />,
    href: "/tools/dashboard",
  },
  {
    label: "Serving Doctor",
    icon: <Stethoscope size={18} />,
    href: "/tools/serving-health",
  },
  {
    label: "Review Doctor",
    icon: <ClipboardCheck size={18} />,
    href: "/tools/review-health",
  },
  {
    label: "Ask",
    icon: <MessageSquare size={18} />,
    href: "/tools/ask",
  },
  {
    label: "Campaigns",
    icon: <Megaphone size={18} />,
    href: "/tools/campaign",
  },
  {
    label: "Ad Groups",
    icon: <Layers size={18} />,
    href: "/tools/ad-groups",
  },
  {
    label: "Ads",
    icon: <Tags size={18} />,
    href: "/tools/ads",
  },
  {
    label: "Reports",
    icon: <BarChart2 size={18} />,
    href: "/tools/reports",
  },
  {
    label: "Inspector",
    icon: <ClipboardCheck size={18} />,
    href: "/tools/audits",
  },
  {
    label: "Optimize",
    icon: <Sparkles size={18} />,
    children: [
      {
        label: "Waste Finder",
        icon: <ShieldMinus size={16} />,
        href: "/tools/optimize/waste-finder",
      },
      {
        label: "Bid Optimizer",
        icon: <TrendingUp size={16} />,
        href: "/tools/optimize/bid-optimizer",
      },
      {
        label: "Budget Pacing",
        icon: <Gauge size={16} />,
        href: "/tools/optimize/budget-pacing",
      },
      {
        label: "Context Hints",
        icon: <Sparkles size={16} />,
        href: "/tools/optimize/context-hints",
      },
      {
        label: "Time Performance",
        icon: <CalendarDays size={16} />,
        href: "/tools/optimize/time-performance",
      },
    ],
  },
  {
    label: "Orchard Watch",
    icon: <BellRing size={18} />,
    href: "/tools/alerts",
  },
  {
    label: "Autopilot",
    icon: <Plane size={18} />,
    href: "/tools/autopilot",
  },
  {
    label: "Spend Limits",
    icon: <DollarSign size={18} />,
    href: "/tools/spend-limits",
  },
  {
    label: "Locations",
    icon: <MapPin size={18} />,
    href: "/tools/locations",
  },
  {
    label: "Live Share",
    icon: <Share2 size={18} />,
    href: "/tools/shared-dashboards",
  },
  {
    label: "Activity",
    icon: <ScrollText size={18} />,
    href: "/tools/activity",
  },
];

/**
 * Status colours for the OpenAI Ads entity states (`active | paused | archived`)
 * and review states. Kept as literal Tailwind classes so they survive purging.
 */
export const getStatusColor = (status?: string | null) => {
  switch ((status ?? "").toLowerCase()) {
    case "active":
    case "approved":
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20";
    case "paused":
    case "in_review":
      return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20";
    case "rejected":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20";
    case "archived":
      return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20";
  }
};

/** Severity colours for serving issues. */
export const getSeverityColor = (severity: "blocking" | "partial" | "warning") => {
  switch (severity) {
    case "blocking":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20";
    case "partial":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20";
    default:
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20";
  }
};

export function formatMetricName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export { Activity };
