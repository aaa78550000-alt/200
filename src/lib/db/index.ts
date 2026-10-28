import type { DataAdapter } from "./adapter";
import { createDemoAdapter } from "./demo/demoAdapter";

export type DataMode = "demo" | "supabase";

export const DATA_MODE: DataMode = (import.meta.env.VITE_DATA_MODE as DataMode) === "supabase" ? "supabase" : "demo";

let instance: Promise<DataAdapter> | null = null;

/** Singleton: one Supabase/GoTrue client per page (StrictMode runs effects twice). */
export function createAdapter(): Promise<DataAdapter> {
  instance ??= DATA_MODE === "supabase" ? import("./supabase/supabaseAdapter").then((m) => m.createSupabaseAdapter()) : Promise.resolve(createDemoAdapter());
  return instance;
}
