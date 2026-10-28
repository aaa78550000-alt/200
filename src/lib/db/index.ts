import type { DataAdapter } from "./adapter";
import { createDemoAdapter } from "./demo/demoAdapter";

export type DataMode = "demo" | "supabase";

export const DATA_MODE: DataMode = (import.meta.env.VITE_DATA_MODE as DataMode) === "supabase" ? "supabase" : "demo";

export async function createAdapter(): Promise<DataAdapter> {
  if (DATA_MODE === "supabase") {
    const { createSupabaseAdapter } = await import("./supabase/supabaseAdapter");
    return createSupabaseAdapter();
  }
  return createDemoAdapter();
}
