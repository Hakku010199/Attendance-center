import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import mapColumnsHandler from "./api/map-columns.js";

function localApiPlugin() {
  return {
    name: "local-api-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === "/api/map-columns" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", async () => {
            try {
              req.body = body ? JSON.parse(body) : {};
              const resMock = {
                status(code) {
                  res.statusCode = code;
                  return this;
                },
                json(data) {
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(data));
                  return this;
                },
                setHeader(k, v) {
                  res.setHeader(k, v);
                },
              };
              await mapColumnsHandler(req, resMock);
            } catch (err) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err?.message || "Internal server error" }));
            }
          });
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Ensure server-side environment variables (e.g. GEMINI_API_KEY) are available in process.env for local API middlewares
  Object.assign(process.env, env);

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
  const supabaseKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    "";

  return {
    envPrefix: ["VITE_", "SUPABASE_"],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabaseKey),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseKey),
    },
    plugins: [react(), localApiPlugin()],
  };
});
