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
else
  echo "警告: 未设置 GIT_TOKEN，数据将不会自动推送"
fi

# 3. 启动采集服务
exec node app.js
