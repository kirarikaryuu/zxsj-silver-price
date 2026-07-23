FROM node:20-alpine

# 装 git（alpine 默认没有）
RUN apk add --no-cache git

WORKDIR /app

# 拷贝项目代码
COPY . .

# 给启动脚本执行权限
RUN chmod +x entrypoint.sh

# 配置 git 身份（commit 用）
RUN git config --global user.name "nas-crawler" && \
    git config --global user.email "nas-crawler@users.noreply.github.com" && \
    git config --global init.defaultBranch main

# 数据目录
RUN mkdir -p data

EXPOSE 8090

# NAS 模式：常驻运行 + 采集后自动 push
ENV AUTO_PUSH=1
CMD ["./entrypoint.sh"]
