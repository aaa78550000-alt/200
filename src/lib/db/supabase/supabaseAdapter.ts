import type { DataAdapter } from "../adapter";

// Implemented in M1 (see docs/ROADMAP.md). Kept as an explicit failure so supabase mode never silently falls back to demo data.
export function createSupabaseAdapter(): DataAdapter {
  throw new Error("Supabase adapter 尚未實作（M1）。請使用 VITE_DATA_MODE=demo。");
}
