/**
 * EMBEDDED: the app runs inside a hosted page frame (claude.ai artifact) where URL paths and new tabs are not
 * available — routing is kept in memory and "open in new tab" links navigate inside the app instead.
 */
export const EMBEDDED = import.meta.env.VITE_EMBEDDED === "1";
