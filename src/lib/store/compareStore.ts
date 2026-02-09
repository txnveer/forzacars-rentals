"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const MAX_COMPARE = 2;
const STORAGE_KEY = "forzacars.compare";

// ---------------------------------------------------------------------------
// Compare Store
// ---------------------------------------------------------------------------

export interface CompareCarData {
  id: string;
  display_name: string;
  manufacturer: string | null;
  model: string | null;
  image_url: string | null;
}

interface CompareState {
  selectedIds: string[];
  carData: Record<string, CompareCarData>; // Cache car details for display in tray
}

interface CompareActions {
  toggle: (id: string, data?: CompareCarData) => void;
  add: (id: string, data?: CompareCarData) => void;
  remove: (id: string) => void;
  clear: () => void;
  set: (ids: string[], data?: CompareCarData[]) => void;
  updateCarData: (id: string, data: CompareCarData) => void;
}

export const useCompareStore = create<CompareState & CompareActions>()(
  persist(
    (set, get) => ({
      selectedIds: [],
      carData: {},

      toggle: (id, data) => {
        const { selectedIds, carData } = get();
        if (selectedIds.includes(id)) {
          // Remove
          set({
            selectedIds: selectedIds.filter((i) => i !== id),
          });
        } else {
          // Add (if not at max)
          if (selectedIds.length >= MAX_COMPARE) return;
          const newCarData = data
            ? { ...carData, [id]: data }
            : carData;
          set({
            selectedIds: [...selectedIds, id],
            carData: newCarData,
          });
        }
      },

      add: (id, data) => {
        const { selectedIds, carData } = get();
        if (selectedIds.includes(id)) return;
        if (selectedIds.length >= MAX_COMPARE) return;
        const newCarData = data
          ? { ...carData, [id]: data }
          : carData;
        set({
          selectedIds: [...selectedIds, id],
          carData: newCarData,
        });
      },

      remove: (id) => {
        const { selectedIds } = get();
        set({
          selectedIds: selectedIds.filter((i) => i !== id),
        });
      },

      clear: () => {
        set({ selectedIds: [], carData: {} });
      },

      set: (ids, data) => {
        const newCarData: Record<string, CompareCarData> = {};
        if (data) {
          for (const car of data) {
            newCarData[car.id] = car;
          }
        }
        set({
          selectedIds: ids.slice(0, MAX_COMPARE),
          carData: newCarData,
        });
      },

      updateCarData: (id, data) => {
        set((state) => ({
          carData: { ...state.carData, [id]: data },
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedIds: state.selectedIds,
        carData: state.carData,
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// Utility hook to check if we can add more cars
// ---------------------------------------------------------------------------

export function useCanAddToCompare(): boolean {
  return useCompareStore((s) => s.selectedIds.length < MAX_COMPARE);
}

export function useIsInCompare(id: string): boolean {
  return useCompareStore((s) => s.selectedIds.includes(id));
}

export { MAX_COMPARE };
