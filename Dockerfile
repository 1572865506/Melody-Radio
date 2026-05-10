# 使用轻量级的 Node.js Alpine 镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装生产环境依赖
RUN npm install --production

# 复制项目所有文件
COPY . .

# 暴露 3000 端口
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]
