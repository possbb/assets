import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AssetManager } from "./app/components/AssetManager";
import { PageLock } from "./app/components/PageLock";
import { HomeLookup } from "./app/components/HomeLookup";
import "./app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PageLock>{window.location.hash === "#home-lookup" ? <HomeLookup /> : <AssetManager />}</PageLock>
  </StrictMode>,
);
