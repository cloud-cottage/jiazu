import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@business": path.resolve(__dirname, "src/business"),
    },
  },
  server: {
    // 浏览器访问端口：默认 5199（可用 PORT 覆盖，如 PORT=5173 npm run dev:h5）
    port: Number(process.env.PORT) || 5199,
    proxy: {
      "/api": {
        // 默认指向自有数据层 compat-api（树 JSON + 详情文档，读写同源）；
        // 本地：COMPAT_SOURCE=local node cloudfunctions/compat-api/local-server.js 3100
        // 指向其他后端时用 API_PROXY 覆盖（legacy Gramps 链路 5197/5198 已于 2026-09-19 退役）
        target: process.env.API_PROXY || "http://localhost:3100",
        changeOrigin: true,
      },
    },
  },
});
