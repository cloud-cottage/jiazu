import { createSSRApp } from 'vue';
import App from './App.vue';

// TDesign 组件库样式（rpx 单位，与小程序一致）
import '@tdesign/uniapp/theme.css';

export function createApp() {
  const app = createSSRApp(App);
  return { app };
}
