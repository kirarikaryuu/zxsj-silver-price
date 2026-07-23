#!/bin/sh
# NAS Docker 启动脚本

# 1. 预创建数据文件（首次启动时不存在，避免报错）
mkdir -p data
if [ ! -f history.json ]; then
  echo '{"lastUpdate":"","totalSamples":0,"servers":{}}' > history.json
fi
if [ ! -f data.js ]; then
  echo 'window.__HISTORY__ = {"lastUpdate":"","totalSamples":0,"servers":{}};' > data.js
fi
echo "数据文件就绪"

# 2. 用 GIT_TOKEN 配置免密 push
if [ -n "$GIT_TOKEN" ]; then
  echo "配置 GitHub token 免密 push..."
  git remote set-url origin "https://x-access-token:${GIT_TOKEN}@github.com/kirarikaryuu/zxsj-silver-price.git"
  echo "Git remote 已配置 token"
  # 首次先把远程最新拉下来，避免本地初始 commit 和远程 diverge 导致后续 push 失败
  echo "同步远程最新数据..."
  git fetch origin || true
  # 如果远程有 main/master 分支，尝试对齐本地 HEAD
  for BR in main master; do
    if git rev-parse --verify "origin/$BR" >/dev/null 2>&1; then
      git reset --soft "origin/$BR" 2>/dev/null || true
      break
    fi
  done
else
  echo "警告: 未设置 GIT_TOKEN，数据将不会自动推送"
fi

# 3. 启动采集服务
exec node app.js
