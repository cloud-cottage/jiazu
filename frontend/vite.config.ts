import { defineConfig, type Plugin } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import path from "path";

/**
 * 修复 @tdesign/uniapp 组件样式在 dev 下失效（白底黑字）的问题。
 *
 * 症状：组件样式规则被编译成空作用域选择器 `.t-cell[data-v-]`，永不命中，t-cell/t-tag/t-button
 * 全部退回浏览器默认外观。
 * 成因：TDesign 组件 SFC 的样式块写作 `<style scoped src="./cell.css">`。@vitejs/plugin-vue
 * 把这类样式请求生成为 `cell.css?vue&type=style&index=0&src=<scopeId>&scoped=<scopeId>`，
 * 并把「样式文件 → 描述符」登记进模块级 cache（linkSrcToDescriptor/setSrcDescriptor）。当该请求
 * 早于宿主 .vue 被转译（例如页面重载/HMR 打乱顺序）时，cache 命中失败，plugin-vue 退化为
 * getTempSrcDescriptor（`id: query.id || ''`，见 @vitejs/plugin-vue/dist/index.mjs:130）→
 * 编译出 `[data-v-]`；该结果随后被 vite 模块图缓存，进程内一直返回，重启 dev server 才恢复。
 *
 * 该请求 URL 上的 `scoped`/`src` 参数本身携带的就是正确的 scope id（= 宿主 .vue 的 descriptor.id），
 * 命中与未命中唯一的差别就是它，故此处据 URL 把空 id 补回。构建/命中路径不受影响（它们本就不含 `[data-v-]`）。
 */
function restoreVueSrcScopeId(): Plugin {
  const EMPTY_SCOPE = "[data-v-]";
  return {
    name: "jiazu:restore-vue-src-scope-id",
    enforce: "post",
    transform(code, id) {
      if (!id.includes("vue&type=style") || !code.includes(EMPTY_SCOPE)) return null;
      const match = /[?&]scoped=([0-9a-f]{6,})/.exec(id);
      if (!match) return null;
      return { code: code.split(EMPTY_SCOPE).join(`[data-v-${match[1]}]`), map: null };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), restoreVueSrcScopeId()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@business": path.resolve(__dirname, "src/business"),
    },
  },
  server: {
    // 浏览器访问端口：默认 5199（可用 PORT 覆盖，如 PORT=5201 npm run dev:h5）
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
