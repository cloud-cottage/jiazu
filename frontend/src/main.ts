import { createSSRApp } from 'vue';
import App from './App.vue';
import { configureCredentials } from './business';

export function createApp() {
  const app = createSSRApp(App);

  // 启动时加载各 tree 的访客凭据（tree-api.json 在 src/static/ 下）
  fetch('/static/tree-api.json')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.trees) {
        configureCredentials(data.trees);
      }
    })
    .catch((e) => console.warn('未加载访客凭据:', e));

  return { app };
}
