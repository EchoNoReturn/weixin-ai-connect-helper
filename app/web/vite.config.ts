import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.PORT) || 3211,
    host: "127.0.0.1",
    proxy: {
      "/api": "http://localhost:3210",
    },
  },
});
