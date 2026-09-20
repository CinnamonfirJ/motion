import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  resolve: {
    // Use the core package's TS source directly for fast HMR in the monorepo.
    conditions: ["development", "browser"],
  },
});
