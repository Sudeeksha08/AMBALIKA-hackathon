import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy: ProxyOptions = {
  target: "http://127.0.0.1:4100",
  changeOrigin: true,
  configure(proxy) {
    proxy.on("error", (_error, _request, response) => {
      // A connection failure is service unavailability, not an application 500.
      // Keep Vite's terminal diagnostics, but give the UI an actionable JSON error.
      if ("writeHead" in response && !response.headersSent && !response.writableEnded) {
        response.writeHead(503, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end(JSON.stringify({
          error: "Cannot reach the VeriDoc backend at 127.0.0.1:4100. Run npm run server in a separate terminal, keep it running, then click Retry or Refresh.",
        }));
      }
    });
  },
};
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    strictPort: true,
    proxy: { "/api": apiProxy },
  },
  preview: { host: "127.0.0.1", proxy: { "/api": apiProxy } },
});
