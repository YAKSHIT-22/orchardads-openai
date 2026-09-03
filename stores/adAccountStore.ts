import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * The currently selected ad account.
 *
 * OpenAI Ads scopes each API key to exactly one ad account, so the account list
 * here is simply the user's connections — one row per key they've pasted.
 *
 * `adAccountId` is the value every API call routes on, and `currency`/`timezone`
 * drive money and date formatting, so both are kept resolved on the store rather
 * than looked up at each render.
 *
 * Only the selected index is persisted (sessionStorage). The connection list
 * itself is refetched, so a revoked key or a renamed account can never be served
 * from a stale cache.
 */

export type ConnectionSummary = {
  id: string;
  label: string | null;
  adAccountId: string;
  adAccountName: string | null;
  accountUrl: string | null;
  currencyCode: string;
  timezone: string;
  reviewStatus: string | null;
  reviewReason: string | null;
  accountStatus: string | null;
  status: "ACTIVE" | "INVALID" | "DISABLED";
  lastError: string | null;
  apiKeyLast4: string;
  /** Stringified BigInt micros, or null when the advertiser hasn't set one. */
  conversionValueMicros: string | null;
  capabilities: Record<string, boolean> | null;
  lastValidatedAt: string | null;
  lastSyncAt: string | null;
};

type AdAccountState = {
  /** External OpenAI ad account id, e.g. "adacct_123". */
  adAccountId: string;
  /** Our connection row id — used when an action must target one credential. */
  connectionId: string;
  currency: string;
  timezone: string;
  connections: ConnectionSummary[];
  selectedIndex: number;

  setConnections: (connections: ConnectionSummary[]) => void;
  setSelectedIndex: (index: number) => void;
  selectByAdAccountId: (adAccountId: string) => void;
  clear: () => void;
};

const EMPTY = { adAccountId: "", connectionId: "", currency: "", timezone: "" };

function resolve(connections: ConnectionSummary[], index: number) {
  const selected = connections[index] ?? connections[0];
  if (!selected) return EMPTY;
  return {
    adAccountId: selected.adAccountId,
    connectionId: selected.id,
    currency: selected.currencyCode || "USD",
    timezone: selected.timezone || "UTC",
  };
}

export const adAccountStore = create<AdAccountState>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      connections: [],
      selectedIndex: 0,

      setConnections: (connections) => {
        // A persisted index can point past the end of the list after a
        // disconnect; fall back to the first account rather than blanking out.
        const stored = get().selectedIndex;
        const index = stored < connections.length ? stored : 0;
        set({ connections, selectedIndex: index, ...resolve(connections, index) });
      },

      setSelectedIndex: (index) => {
        const { connections } = get();
        set({ selectedIndex: index, ...resolve(connections, index) });
      },

      selectByAdAccountId: (adAccountId) => {
        const { connections } = get();
        const index = connections.findIndex((c) => c.adAccountId === adAccountId);
        if (index < 0) return;
        set({ selectedIndex: index, ...resolve(connections, index) });
      },

      clear: () => set({ connections: [], selectedIndex: 0, ...EMPTY }),
    }),
    {
      name: "orchardads-ad-account",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ selectedIndex: state.selectedIndex }),
    }
  )
);

/** The active connection object, or null before connections have loaded. */
export function useActiveConnection(): ConnectionSummary | null {
  const { connections, selectedIndex } = adAccountStore();
  return connections[selectedIndex] ?? connections[0] ?? null;
}
