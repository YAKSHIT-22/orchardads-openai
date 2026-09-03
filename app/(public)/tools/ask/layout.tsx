import { PlanGate } from "@/lib/billing/PlanGate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PlanGate feature="ai_analyst">{children}</PlanGate>;
}
