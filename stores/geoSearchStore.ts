import type { GeoLocationResult as GeoData } from "@/types/geoDetails";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Cache of the last location search, per ad account.
 *
 * `/geo_lookup/search` takes only `q` and `limit` — there is no cursor, so
 * there is nothing to page through server-side. One request returns the whole
 * result set and the table pages it client-side.
 */
interface GeoSearchState {
  query: string;
  results: { [adAccountId: string]: GeoData[] };
  setQuery: (query: string) => void;
  setResults: (adAccountId: string, data: GeoData[]) => void;
  getCurrentResults: (adAccountId: string) => GeoData[];
  clear: () => void;
}

export const useGeoSearch = create<GeoSearchState>()(
  persist(
    (set, get) => ({
      query: "",
      results: {},
      setQuery: (query) => set({ query }),
      setResults: (adAccountId, data) =>
        set({ results: { [adAccountId]: data } }),
      getCurrentResults: (adAccountId) => get().results[adAccountId] || [],
      clear: () => set({ query: "", results: {} }),
    }),
    {
      name: "geo-search",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
