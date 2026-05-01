import "./styles.css";
import { createRoot } from "react-dom/client";
import AppShell from "./AppShell";

const root = createRoot(document.getElementById("root")!);
root.render(<AppShell />);
