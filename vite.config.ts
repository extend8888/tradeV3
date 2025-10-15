import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 3005,
    host: true,
    proxy: {
      '/api/helius': {
        target: 'https://rpc.helius.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/helius/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/api/jupiter': {
        target: 'https://price.jup.ag',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/jupiter/, ''),
      },
      '/api/dexscreener': {
        target: 'https://api.dexscreener.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/dexscreener/, ''),
      }
    }
  },
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }),
    tsconfigPaths(),
    // Add Node.js polyfills
    nodePolyfills({
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
    }),
  ],
  define: {
    global: 'globalThis',
  },
})