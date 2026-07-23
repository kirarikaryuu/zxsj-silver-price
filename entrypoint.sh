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
  # 注意：加超时保护，避免容器网络不通时 git 无限卡死导致 app.js 起不来
  echo "同步远程最新数据（最多等 20 秒）..."
  timeout 20 git fetch origin || echo "警告: git fetch 超时或失败，跳过同步（不影响采集）"
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
