import React from "react";
import ReactDOM from "react-dom/client";
import AppErrorBoundary, { AppLoading, AppModuleLoadError, installClientErrorSignals } from "./AppErrorBoundary.jsx";
import "./index.css";

const App = React.lazy(() => import("./App.jsx").catch(() => { throw new AppModuleLoadError(); }));

const uninstallClientErrorSignals = installClientErrorSignals();
if (import.meta.hot) import.meta.hot.dispose(uninstallClientErrorSignals);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <React.Suspense fallback={<AppLoading />}>
        <App />
      </React.Suspense>
    </AppErrorBoundary>
  </React.StrictMode>
);
