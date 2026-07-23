FROM node:20-alpine

# 装 git + 时区数据（alpine 默认都没有）
RUN apk add --no-cache git tzdata

# 时区设为上海（日志/数据时间正确，不差 8 小时）
ENV TZ=Asia/Shanghai

WORKDIR /app

# 拷贝项目代码
COPY . .

# 给启动脚本执行权限
RUN chmod +x entrypoint.sh

# 配置 git 身份（commit 用）
RUN git config --global user.name "nas-crawler" && \
    git config --global user.email "nas-crawler@users.noreply.github.com" && \
    git config --global init.defaultBranch main

# 关闭 git 分支保护，避免首次 push 因 diverge 失败
RUN git config --global pull.rebase false

# 数据目录
RUN mkdir -p data

EXPOSE 8090

# NAS 模式：常驻运行 + 采集后自动 push
ENV AUTO_PUSH=1
CMD ["./entrypoint.sh"]
