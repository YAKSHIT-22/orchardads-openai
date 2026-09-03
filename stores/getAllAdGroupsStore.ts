import type { AllAdGroupsData as AdGroup } from "@/types/adGroupDetails";
import { midLimit } from "@/utils/variableConstant";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface AdGroupsState {
  offset: number;
  results: { [campaignId: string]: AdGroup[] };
  incrementOffset: () => void;
  resetOffset: () => void;
  addResults: (campaignId: string, data: AdGroup[]) => void;
  deleteSingle: (campaignId: string, id: string) => void;
  updateSingle: (campaignId: string, updated: AdGroup) => void;
  clear: () => void;
}

export const useGetAllAdGroups = create<AdGroupsState>()(
  persist(
    (set) => ({
      offset: 0,
      results: {},
      incrementOffset: () => set((state) => ({ offset: state.offset + midLimit })),
      resetOffset: () => set({ offset: 0 }),
      addResults: (campaignId, data) =>
        set((state) => {
          const existing = state.results[campaignId] || [];
          const existingIds = new Set(existing.map((item) => item.id));
          const newUnique = data.filter((item) => !existingIds.has(item.id));
          return { results: { ...state.results, [campaignId]: [...existing, ...newUnique] } };
        }),
      deleteSingle: (campaignId, id) =>
        set((state) => {
          const existing = state.results[campaignId] || [];
          return { results: { ...state.results, [campaignId]: existing.filter((item) => item.id !== id) } };
        }),
      updateSingle: (campaignId, updated) =>
        set((state) => {
          const existing = state.results[campaignId] || [];
          return {
            results: {
              ...state.results,
              [campaignId]: existing.map((item) => (item.id === updated.id ? updated : item)),
            },
          };
        }),
      clear: () => set({ results: {}, offset: 0 }),
    }),
    { name: "getall-adgroups", storage: createJSONStorage(() => sessionStorage) }
  )
);
