import { TractatusEditorApp } from "./app.js";

const root = document.querySelector("#app");

if (!root) {
  throw new Error("App root not found");
}

new TractatusEditorApp(root);
