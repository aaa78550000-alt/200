/** Absolute in-site path that respects the deploy base (e.g. GitHub Pages serves under /<repo>/). */
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
export const sitePath = (p: string) => `${BASE_PATH}${p}`;
