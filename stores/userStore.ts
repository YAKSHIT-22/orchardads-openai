import { create } from "zustand";

type UserState = {
  name : string;
  userId: string;
  email: string;
  publicKey: string;
  setUser: (name: string, userId: string, email: string) => void;
  clearUser: () => void;
  setPublicKey: (publicKey: string) => void;
};

export const useUserStore = create<UserState>((set) => ({
  name: "",
  userId: "",
  email: "",
  publicKey: "",
  setUser: (name, userId, email) => set({ name, userId, email }),
  clearUser: () => set({ name: "",  userId: "", email: "" }),
  setPublicKey: (publicKey: string) => set((state) => ({ ...state, publicKey })),
}));
