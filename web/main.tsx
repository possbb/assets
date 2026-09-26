import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AssetManager } from "./app/components/AssetManager";
import { PageLock } from "./app/components/PageLock";
import "./app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PageLock><AssetManager /></PageLock>
  </StrictMode>,
);
