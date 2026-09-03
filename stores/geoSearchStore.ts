import type { GeoLocationResult as GeoData } from "@/types/geoDetails";
import { midLimit } from "@/utils/variableConstant";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface GeoSearchState {
  query: string;
  entity: "AdminArea" | "Locality" | "Country";
  countrycode: string;
  offset: number;
  results: { [adAccountId: string]: GeoData[] };
  setQuery: (query: string, entity: "AdminArea" | "Locality" | "Country", countrycode: string) => void;
  incrementOffset: () => void;
  resetOffset: () => void;
  addResults: (
    adAccountId: string,
    offset: number,
    entity: "AdminArea" | "Locality" | "Country",
    countrycode: string,
    data: GeoData[]
  ) => void;
  getCurrentResults: (adAccountId: string) => GeoData[];
  clear: () => void;
}

export const useGeoSearch = create<GeoSearchState>()(
  persist(
    (set, get) => ({
      query: "",
      entity: "AdminArea",
      countrycode: "US",
      offset: 0,
      results: {},
      setQuery: (query, entity, countrycode) =>
        set({ query, entity, countrycode }),
      incrementOffset: () =>
        set((state) => ({ offset: state.offset + midLimit })),
      resetOffset: () => set({ offset: 0 }),
      addResults: (adAccountId, offset, entity, countrycode, data) =>
        set((state) => {
          const existing = state.results[adAccountId] || [];
          const existingIds = new Set(existing.map((item) => item.id));

          const newUniqueData = data.filter(
            (item) => !existingIds.has(item.id)
          );

          const updatedResults =
            offset >= existing.length
              ? [...existing, ...newUniqueData]
              : [
                  ...existing.slice(0, offset),
                  ...newUniqueData,
                  ...existing.slice(offset + newUniqueData.length),
                ];

          return {
            entity,
            countrycode,
            results: {
              [adAccountId]: updatedResults,
            },
          };
        }),
      getCurrentResults: (adAccountId) => {
        const { results, entity, countrycode } = get();
        const storedEntity = get().entity;
        const storedCountry = get().countrycode;
        if (storedEntity === entity && storedCountry === countrycode) {
          return results[adAccountId] || [];
        }
        return [];
      },
      clear: () =>
        set({
          query: "",
          entity: "AdminArea",
          countrycode: "US",
          results: {},
          offset: 0,
        }),
    }),
    {
      name: "geo-search",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
