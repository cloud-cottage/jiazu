#!/usr/bin/env bash
# ============================================
# 手动备份脚本
#
# 用法:
#   ./shell-scripts/backup.sh [tree_id]
#
# 不带参数：备份全部 tree
# 带 tree_id：仅备份指定 tree
#
# 备份内容：
#   1. 所有 tree 的 .gramps 完整备份包
#   2. tree-meta.json 元数据配置
#   3. 上传至 COS 异地备份桶（上海地域）
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups/$(date +%Y%m%d_%H%M%S)"
GRAMPS_API="${GRAMPS_API:-http://localhost:8000}"

# 从 .env 加载配置
if [ -f "${PROJECT_DIR}/.env" ]; then
  set -a
  source "${PROJECT_DIR}/.env"
  set +a
fi

mkdir -p "${BACKUP_DIR}"

echo "============================================"
echo "家族历史数字馆 — 手动备份"
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "备份目录: ${BACKUP_DIR}"
echo "============================================"

# 1. 备份 tree-meta.json
echo ""
echo "[1/3] 备份 tree-meta.json..."
cp "${PROJECT_DIR}/config/tree-meta.json" "${BACKUP_DIR}/tree-meta.json"
echo "  ✓ 已复制到 ${BACKUP_DIR}/tree-meta.json"

# 2. 导出各 tree 的 .gramps
echo ""
echo "[2/3] 导出家谱数据..."
TREE_ID="${1:-}"

if [ -n "${TREE_ID}" ]; then
  # 仅备份指定 tree
  echo "  导出: ${TREE_ID}"
  curl -s -o "${BACKUP_DIR}/${TREE_ID}.gramps" \
    "${GRAMPS_API}/api/export/gramps?tree=${TREE_ID}" \
    || echo "  ⚠️ 导出 ${TREE_ID} 失败（API 可能未运行）"
else
  # 备份全部 tree：从 tree-meta.json 读取
  TREE_IDS=$(node -e "
    const meta = require('${PROJECT_DIR}/config/tree-meta.json');
    Object.values(meta.trees).forEach(t => console.log(t.tree_id));
  " 2>/dev/null || echo "")

  if [ -z "${TREE_IDS}" ]; then
    echo "  ⚠️ 未找到已注册的 tree，跳过"
  else
    for tid in ${TREE_IDS}; do
      echo "  导出: ${tid}"
      curl -s -o "${BACKUP_DIR}/${tid}.gramps" \
        "${GRAMPS_API}/api/export/gramps?tree=${tid}" \
        || echo "  ⚠️ 导出 ${tid} 失败"
    done
  fi

  # 也导出 GEDCOM 格式
  for tid in ${TREE_IDS}; do
    curl -s -o "${BACKUP_DIR}/${tid}.ged" \
      "${GRAMPS_API}/api/export/gedcom?tree=${tid}" \
      2>/dev/null || true
  done
fi

echo "  ✓ 导出完成"

# 3. 上传到 COS 异地备份桶
echo ""
echo "[3/3] 上传至 COS 备份桶..."
if [ -n "${COS_BACKUP_BUCKET:-}" ] && command -v coscli &>/dev/null; then
  coscli cp -r "${BACKUP_DIR}" "cos://${COS_BACKUP_BUCKET}/backups/$(basename ${BACKUP_DIR})/"
  echo "  ✓ COS 备份完成"
else
  echo "  ⚠️ COS 备份桶未配置或 coscli 未安装，跳过远程备份"
  echo "  本地备份在: ${BACKUP_DIR}"
fi

echo ""
echo "============================================"
echo "备份完成!"
echo "本地: ${BACKUP_DIR}"
echo ""
echo "⚠️  提醒: 请将备份文件同步到 NAS / 移动硬盘做离线兜底"
echo "============================================"
