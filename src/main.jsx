import React from "react";
import ReactDOM from "react-dom/client";
import AppErrorBoundary, { AppLoading, AppModuleLoadError, installClientErrorSignals } from "./AppErrorBoundary.jsx";
const App = React.lazy(async () => {
  try {
    const [module] = await Promise.all([import("./App.jsx"), import("./index.css")]);
    return module;
  } catch {
    throw new AppModuleLoadError();
  }
});

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
