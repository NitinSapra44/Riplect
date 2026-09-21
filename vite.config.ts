import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "frontend", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react-hook-form",
      "@hookform/resolvers",
      "@tanstack/react-query",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "zod",
    ],
  },
  root: path.resolve(import.meta.dirname, "frontend"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/wouter/') ||
            id.includes('/node_modules/@tanstack/react-query/') ||
            id.includes('/node_modules/react-hook-form/') ||
            id.includes('/node_modules/@hookform/')
          ) return 'vendor';
          if (
            id.includes('/node_modules/@radix-ui/react-dialog/') ||
            id.includes('/node_modules/@radix-ui/react-dropdown-menu/') ||
            id.includes('/node_modules/@radix-ui/react-popover/') ||
            id.includes('/node_modules/@radix-ui/react-tabs/') ||
            id.includes('/node_modules/@radix-ui/react-toast/') ||
            id.includes('/node_modules/@radix-ui/react-tooltip/')
          ) return 'ui';
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
