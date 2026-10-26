import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { DesktopWidget } from "./DesktopWidget";
import "./styles.css";

const desktopWidget = window.location.hash === "#run-widget";
if (desktopWidget) document.documentElement.classList.add("desktop-widget-surface");
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode>{desktopWidget ? <DesktopWidget/> : <App/>}</React.StrictMode>);
