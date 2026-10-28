import { useSyncExternalStore } from "react";

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Matches Tailwind `lg` (1024px): desktop layouts (side nav, master–detail, drawers). */
export const useIsDesktop = () => useMedia("(min-width: 1024px)");

/** Matches Tailwind `xl` (1280px): room for a docked 440px detail panel next to a list. */
export const useIsWide = () => useMedia("(min-width: 1280px)");
