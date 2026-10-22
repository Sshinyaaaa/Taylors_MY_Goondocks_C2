import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tideDpopPlugin } from "@tidecloak/js/vite";

export default defineConfig({
  // tideDpopPlugin serves the DPoP page (/tide_dpop/*) with the headers the Tide enclave needs.
  plugins: [react(), tailwindcss(), tideDpopPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    // changeOrigin stays false so the API sees Host: localhost:5173, which is the htu the browser
    // signed into its DPoP proof.
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: false } },
  },
});
