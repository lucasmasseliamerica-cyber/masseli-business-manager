import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function publicTestKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key || "")) return true;
  try {
    const parts = key.split(".");
    const claims = JSON.parse(Buffer.from(parts[1], "base64url"));
    return parts.length === 3 && claims.role === "anon" && claims.ref === "msinksoilkluooxenecy" && claims.exp > Date.now() / 1000;
  } catch { return false; }
}

export default defineConfig(({ command, mode }) => {
  const preview = process.env.VERCEL_ENV === "preview" || process.env.VERCEL_GIT_COMMIT_REF === "automation/nexalvo-qa-actions";
  if (command === "build" && preview) {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    if (env.VITE_SUPABASE_URL?.replace(/\/$/, "") !== "https://msinksoilkluooxenecy.supabase.co" ||
        !publicTestKey(env.VITE_SUPABASE_ANON_KEY) || env.VITE_CARD_PAYMENT_MODE !== "stripe_terminal") {
      throw new Error("Vercel Preview requires the TEST Supabase URL, its public browser key and stripe_terminal payment mode.");
    }
  }
  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("lucide-react")) return "icons";
            if (id.includes("react") || id.includes("scheduler")) return "react-vendor";
            return "vendor";
          },
        },
      },
    },
  };
});
