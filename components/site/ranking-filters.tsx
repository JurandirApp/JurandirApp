"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { recordSearchEventAction } from "@/lib/actions/site";

type FiltersState = {
  city: string;
  bairro: string;
  cuisine: string;
  tipo: string;
  /** "" = any day, otherwise "0".."6" (0 = Sunday). */
  day: string;
  openNow: boolean;
};

type FiltersContextValue = FiltersState & {
  setCity: (v: string) => void;
  setBairro: (v: string) => void;
  setCuisine: (v: string) => void;
  setTipo: (v: string) => void;
  setDay: (v: string) => void;
  toggleOpenNow: () => void;
  clear: () => void;
  hasFilter: boolean;
};

const FiltersContext = createContext<FiltersContextValue | null>(null);

export function useRankingFilters(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx)
    throw new Error("useRankingFilters must be used within <RankingFiltersProvider>");
  return ctx;
}

const INITIAL: FiltersState = {
  city: "",
  bairro: "",
  cuisine: "",
  tipo: "",
  day: "",
  openNow: false,
};

export function RankingFiltersProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FiltersState>(INITIAL);

  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const id = setTimeout(() => {
      void recordSearchEventAction({
        city: state.city,
        neighborhood: state.bairro,
        cuisine: state.cuisine,
        type: state.tipo,
        openNow: state.openNow,
      });
    }, 800);
    return () => clearTimeout(id);
  }, [state]);

  const value = useMemo<FiltersContextValue>(
    () => ({
      ...state,
      // Changing city clears the neighborhood (matches prototype).
      setCity: (v) => setState((s) => ({ ...s, city: v, bairro: "" })),
      setBairro: (v) => setState((s) => ({ ...s, bairro: v })),
      setCuisine: (v) => setState((s) => ({ ...s, cuisine: v })),
      setTipo: (v) => setState((s) => ({ ...s, tipo: v })),
      setDay: (v) => setState((s) => ({ ...s, day: v })),
      toggleOpenNow: () => setState((s) => ({ ...s, openNow: !s.openNow })),
      clear: () => setState(INITIAL),
      hasFilter: Boolean(
        state.city ||
          state.bairro ||
          state.cuisine ||
          state.tipo ||
          state.day !== "" ||
          state.openNow,
      ),
    }),
    [state],
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}
