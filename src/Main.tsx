import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./Common/Main.scss";
import App from "./App";

// #app, not #root: app.scss's layout rules and the pre-boot skeleton both hang off that id.
const container = document.getElementById("app");
if (!container) {
  throw new Error("Failed to find the #app element");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
