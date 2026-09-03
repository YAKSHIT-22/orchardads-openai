import { PlanGate } from "@/lib/billing/PlanGate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PlanGate feature="time_performance">{children}</PlanGate>;
}
