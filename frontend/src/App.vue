<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';

onLaunch(() => {
  console.log('家族历史数字馆 App Launch');
});

onShow(() => {
  console.log('App Show');
});

onHide(() => {
  console.log('App Hide');
});
</script>

<style>
/* 全局样式 */
page {
  background-color: #f8f8f8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  color: #333;
  font-size: 14px;
}

/* ---- TDesign 主题覆盖：古籍棕 ---- */
/* #ifdef H5 */
:root,
/* #endif */
page,
.page {
  --td-brand-color-1: #fdf6ec;
  --td-brand-color-2: #f9e8d0;
  --td-brand-color-3: #f0d0a8;
  --td-brand-color-4: #e4b27e;
  --td-brand-color-5: #d49355;
  --td-brand-color-6: #b06e33;
  --td-brand-color-7: #8b4513;
  --td-brand-color-8: #7a3a0e;
  --td-brand-color-9: #5c2d0a;
  --td-brand-color-10: #3e2723;

  --td-primary-color: #8b4513;
  --td-primary-color-1: var(--td-brand-color-1);
  --td-primary-color-2: var(--td-brand-color-2);
  --td-primary-color-3: var(--td-brand-color-3);
  --td-primary-color-4: var(--td-brand-color-4);
  --td-primary-color-5: var(--td-brand-color-5);
  --td-primary-color-6: var(--td-brand-color-6);
  --td-primary-color-7: var(--td-brand-color-7);
  --td-primary-color-8: var(--td-brand-color-8);
  --td-primary-color-9: var(--td-brand-color-9);
  --td-primary-color-10: var(--td-brand-color-10);

  --td-success-color: #2e7d32;
  --td-warning-color: #e65100;
  --td-error-color: #c62828;
}

/* 声明文本样式 */
.disclaimer {
  font-size: 12px;
  color: #999;
  line-height: 1.6;
}
</style>
