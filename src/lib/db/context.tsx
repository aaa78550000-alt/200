import { createContext, useContext } from "react";
import type { DataAdapter } from "./adapter";

export const AdapterContext = createContext<DataAdapter | null>(null);

export function useAdapter(): DataAdapter {
  const a = useContext(AdapterContext);
  if (!a) throw new Error("AdapterContext missing");
  return a;
}
