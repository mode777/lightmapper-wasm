import "./styles.css";
import { createApp } from "./app";

const mount = document.getElementById("app");
if (!mount) {
  throw new Error("showcase: #app mount point is missing");
}

createApp(mount);
