import { defineConfig } from "vite";

const serverTarget = `http://localhost:${process.env.TABBLETOP_PORT ?? 30000}`;

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": serverTarget,
      "/modules": serverTarget,
      "/systems": serverTarget,
      "/uploads": serverTarget,
      "/rpgs": serverTarget,
      "/rpgs.html": serverTarget,
      "/socket.io": { target: serverTarget, ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    rolldownOptions: {
      input: { main: "index.html", rpgs: "rpgs.html" },
      // Rolls, terms and documents serialize via constructor.name, and addons compare class names.
      output: { keepNames: true },
    },
  },
});
