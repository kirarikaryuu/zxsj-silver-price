#!/bin/sh
# NAS Docker 启动脚本
# 用 GIT_TOKEN 替换 git remote URL，实现免密 push

if [ -n "$GIT_TOKEN" ]; then
  echo "配置 GitHub token 免密 push..."
  git remote set-url origin "https://x-access-token:${GIT_TOKEN}@github.com/kirarikaryuu/zxsj-silver-price.git"
  echo "Git remote 已配置 token"
else
  echo "警告: 未设置 GIT_TOKEN，数据将不会自动推送"
fi

# 启动采集服务
exec node app.js
