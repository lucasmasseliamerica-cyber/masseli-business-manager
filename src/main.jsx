import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AppErrorBoundary, { installClientErrorSignals } from "./AppErrorBoundary.jsx";
import "./index.css";

const uninstallClientErrorSignals = installClientErrorSignals();
if (import.meta.hot) import.meta.hot.dispose(uninstallClientErrorSignals);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
