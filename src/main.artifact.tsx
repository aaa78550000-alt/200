// Entry for the hosted single-page build (claude.ai artifact): demo data, in-memory routing, Google Fonts via <link>.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
