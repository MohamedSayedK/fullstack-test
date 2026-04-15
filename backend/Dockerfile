FROM node:18-alpine

WORKDIR /app

# Copy package files and install ALL deps (including devDeps for build)
COPY package*.json ./
RUN npm ci

# Copy source and prisma schema
COPY prisma ./prisma
COPY src ./src
COPY nest-cli.json tsconfig*.json ./

# Generate Prisma client and compile TypeScript
RUN npx prisma generate
RUN npx nest build

# Remove devDependencies after build
RUN npm prune --production

EXPOSE 3000

CMD ["node", "dist/main"]
