import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          [
            "babel-plugin-styled-components",
            {
              displayName: true,
              fileName: true,
              ssr: false,
            },
          ],
        ],
      },
    }),
    VitePWA({
      // registerType: 'autoUpdate', // Automatically update SW when new content is available
      injectRegister: "auto", // Let the plugin handle SW registration automatically
      workbox: {
        // globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff,woff2}'], // Cache common file types
        // Optional: Runtime caching for specific routes/origins
        // runtimeCaching: [
        //   {
        //     urlPattern: /^https:\/\/api\.allorigins\.win\/.*/i, // Example: Cache the CORS proxy calls
        //     handler: 'NetworkFirst', // Or 'CacheFirst', 'StaleWhileRevalidate'
        //     options: {
        //       cacheName: 'api-cache',
        //       expiration: {
        //         maxEntries: 10,
        //         maxAgeSeconds: 60 * 60 * 24 // 1 day
        //       },
        //       cacheableResponse: {
        //         statuses: [0, 200] // Cache successful responses & opaque responses
        //       }
        //     }
        //   }
        // ]
      },
      manifest: {
        short_name: "Chessdle",
        name: "Chessdle - Daily Chess Puzzle Game",
        description:
          "Guess the daily Lichess puzzle sequence in a Wordle-like format.",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            type: "image/png",
            sizes: "192x192",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-512x512.png",
            type: "image/png",
            sizes: "512x512",
            purpose: "any maskable",
          },
        ],
        start_url: ".",
        display: "standalone",
        theme_color: "#00251f",
        background_color: "#00251f",
      },
    }),
  ],
  base: "/chessdle/",
});
