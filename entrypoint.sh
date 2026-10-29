#!/bin/sh
# NAS Docker 启动脚本
# 推送方式：GitHub Contents REST API（不用 git 命令，避免容器内 git 访问 github 卡死）
# 数据文件：data/silver-price-YYYY-MM-DD.json（按天归档，持久化在挂载卷）
#           data.js（轻量汇总，启动/每轮自动重建，无需预创建）
# 注意：history.json 已废弃（2026-10 重构），不再生成/推送。

# 1. 确保数据目录存在
mkdir -p data
echo "数据目录就绪"

# 2. 检查 token
if [ -n "$GIT_TOKEN" ]; then
  echo "GitHub token 已配置，将通过 API 推送 data.js + 当天归档"
else
  echo "警告: 未设置 GIT_TOKEN，数据将不会自动推送"
fi

# 3. 启动服务（启动时会从 data/ 聚合历史并重建 data.js）
exec node app.js
