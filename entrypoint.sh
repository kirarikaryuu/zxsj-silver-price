#!/bin/sh
# NAS Docker 启动脚本
# 推送方式：GitHub Contents REST API（不用 git 命令，避免容器内 git 访问 github 卡死）

# 1. 预创建数据文件（首次启动时不存在，避免报错）
mkdir -p data
if [ ! -f history.json ]; then
  echo '{"lastUpdate":"","totalSamples":0,"servers":{}}' > history.json
fi
if [ ! -f data.js ]; then
  echo 'window.__HISTORY__ = {"lastUpdate":"","totalSamples":0,"servers":{}};' > data.js
fi
echo "数据文件就绪"

# 2. 检查 token
if [ -n "$GIT_TOKEN" ]; then
  echo "GitHub token 已配置，将通过 API 推送数据"
else
  echo "警告: 未设置 GIT_TOKEN，数据将不会自动推送"
fi

# 3. 启动采集服务
exec node app.js
