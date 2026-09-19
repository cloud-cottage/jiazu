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
        // 需回旧 Gramps 链路（只读/兼容排查）时用 API_PROXY=http://127.0.0.1:5197（见 npm run dev:h5:legacy）
        target: process.env.API_PROXY || "http://localhost:3100",
        changeOrigin: true,
      },
    },
  },
});
