<template>
  <view class="container">
    <view class="section">
      <text class="section-title">关于本站</text>
      <text class="text">
        家族历史数字馆（jiazutong.cn）是家族历史数字化研究平台，
        致力于家谱、旧谱文献、迁徙史料的数字化整理与展示。
      </text>
    </view>

    <view class="section">
      <text class="section-title">声明</text>
      <text class="text">
        本站为家族历史数字化平台，不属于任何宗亲会、联谊会、社会组织。
        无理事会，不组织线下聚会，不收取会费，不接受捐赠。
      </text>
      <text class="text mt">
        在世亲属信息全部脱敏保护，不会公开完整生辰、籍贯等隐私。
        史料、家谱投稿仅通过公开联系邮箱提交。
      </text>
    </view>

    <view class="section">
      <text class="section-title">用户与资金</text>
      <text class="text">
        本站开放注册：手机号 + 短信验证码，无密码。
        注册用户可充值、转账支持家族树；新建家族树需支付固定费用。
        新用户默认只读，编辑权限需管理员审核。
      </text>
    </view>

    <view class="section">
      <text class="section-title">联系我们</text>
      <text class="text">投稿邮箱：history@jiazutong.cn</text>
    </view>

    <view class="section">
      <text class="section-title">隐私说明</text>
      <text class="text">
        本站在世人物信息自动脱敏：仅展示姓名，隐藏生日、出生地、配偶完整信息。
        已故人物信息完整公开用于学术研究用途。
        不使用 Cookie 追踪，不收集用户行为数据。
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
</script>

<style scoped>
.container { padding: 20px; }
.section {
  margin-bottom: 16px; background: #fff; border-radius: 12px;
  padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.section-title { font-size: 16px; font-weight: bold; color: #8B4513; display: block; margin-bottom: 8px; }
.text { font-size: 14px; color: #555; line-height: 1.8; display: block; }
.mt { margin-top: 8px; }
</style>
