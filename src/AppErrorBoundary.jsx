import React from "react";
import { LANGUAGE_STORAGE_KEY, normalizeLanguage } from "./i18n.jsx";

const CLIENT_ERROR_EVENT = "nexalvo:client-error";
const CLIENT_ERROR_SOURCES = new Set(["react-boundary", "window-error", "unhandled-rejection"]);

function newIncidentId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // The timestamp/random fallback below is only a correlation label, never a security token.
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function publishSanitizedClientError(source) {
  const detail = Object.freeze({
    incidentId: newIncidentId(),
    occurredAt: new Date().toISOString(),
    source: CLIENT_ERROR_SOURCES.has(source) ? source : "unknown",
  });
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent(CLIENT_ERROR_EVENT, { detail }));
    }
  } catch {
    // Recovery must still render when the browser blocks or lacks CustomEvent.
  }
  return detail.incidentId;
}

export function installClientErrorSignals() {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
  const onError = () => publishSanitizedClientError("window-error");
  const onUnhandledRejection = () => publishSanitizedClientError("unhandled-rejection");
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

function fallbackLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored) return normalizeLanguage(stored);
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
  try {
    return normalizeLanguage(document.documentElement.lang);
  } catch {
    return "en";
  }
}

const COPY = {
  en: {
    title: "NEXALVO needs to recover",
    message: "An unexpected interface error occurred. No operation is being retried automatically.",
    guidance: "Try opening the application again. If the problem returns, send the reference below to support.",
    retry: "Open application again",
    reload: "Reload page",
    reference: "Support reference",
  },
  "pt-BR": {
    title: "O NEXALVO precisa se recuperar",
    message: "Ocorreu um erro inesperado na interface. Nenhuma operação será repetida automaticamente.",
    guidance: "Tente abrir o aplicativo novamente. Se o problema voltar, envie a referência abaixo ao suporte.",
    retry: "Abrir aplicativo novamente",
    reload: "Recarregar página",
    reference: "Referência para suporte",
  },
};

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false, incidentId: "", generation: 0 };
    this.headingRef = React.createRef();
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch() {
    const incidentId = publishSanitizedClientError("react-boundary");
    this.setState({ incidentId }, () => this.headingRef.current?.focus());
  }

  retry = () => {
    this.setState((current) => ({ crashed: false, incidentId: "", generation: current.generation + 1 }));
  };

  reload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.crashed) return <React.Fragment key={this.state.generation}>{this.props.children}</React.Fragment>;

    const copy = COPY[fallbackLanguage()];
    return (
      <main role="alert" aria-live="assertive" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#0A0710", color: "#FFFFFF", fontFamily: "system-ui, sans-serif" }}>
        <section style={{ width: "100%", maxWidth: 520, border: "1px solid #3A2456", borderRadius: 24, padding: 24, background: "#180C28" }}>
          <div style={{ color: "#FFD400", fontWeight: 900, letterSpacing: "0.08em", fontSize: 13, marginBottom: 16 }}>NEXALVO</div>
          <h1 ref={this.headingRef} tabIndex="-1" style={{ margin: "0 0 12px", fontSize: 24 }}>{copy.title}</h1>
          <p style={{ color: "#FFFFFF", lineHeight: 1.5 }}>{copy.message}</p>
          <p style={{ color: "#B6A6D1", lineHeight: 1.5 }}>{copy.guidance}</p>
          {this.state.incidentId && <p style={{ color: "#B6A6D1", fontSize: 12, overflowWrap: "anywhere" }}>{copy.reference}: <code>{this.state.incidentId}</code></p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
            <button type="button" onClick={this.retry} style={{ border: 0, borderRadius: 14, padding: "11px 16px", background: "#B6FF3C", color: "#0A0710", fontWeight: 800, cursor: "pointer" }}>{copy.retry}</button>
            <button type="button" onClick={this.reload} style={{ border: "1px solid #B6A6D1", borderRadius: 14, padding: "11px 16px", background: "transparent", color: "#FFFFFF", fontWeight: 700, cursor: "pointer" }}>{copy.reload}</button>
          </div>
        </section>
      </main>
    );
  }
}
