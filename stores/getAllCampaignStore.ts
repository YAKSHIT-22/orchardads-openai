import { AllCampaignsData } from "@/types/campaignDetails";
import { midLimit } from "@/utils/variableConstant";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface getCampaignsState {
  offset: number;
  results: { [adAccountId: string]: AllCampaignsData[] };
  incrementOffset: () => void;
  resetOffset: () => void;
  addResults: (adAccountId: string, offset: number, data: AllCampaignsData[]) => void;
  deleteSingleCampaign: (adAccountId: string, id: string) => void;
  clear: () => void;
}

export const useGetAllCampaigns = create<getCampaignsState>()(
  persist(
    (set) => ({
      offset: 0,
      results: {},
      incrementOffset: () =>
        set((state) => ({ offset: state.offset + midLimit })),
      resetOffset: () => set({ offset: 0 }),
      addResults: (adAccountId, offset, data) =>
        set((state) => {
          const existing = state.results[adAccountId] || [];
          const existingIds = new Set(existing.map((item) => item.id));

          const newUniqueData = data.filter(
            (item) => !existingIds.has(item.id)
          );

          const updatedResults = [...existing, ...newUniqueData]
             
          return {
            results: {
              [adAccountId]: updatedResults,
            },
          };
        }),
      deleteSingleCampaign: (adAccountId, id) => {
        set((state) => {
          const existing = state.results[adAccountId] || [];
          const updatedResults = existing.filter((item) => item.id !== id);
          return {
            results: {
              [adAccountId]: updatedResults,
            },
          };
        });
      },
      clear: () => set({ results: {}, offset: 0 }),
    }),
    {
      name: "getall-campaigns",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
