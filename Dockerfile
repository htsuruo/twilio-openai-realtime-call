FROM oven/bun:latest

COPY package.json ./
COPY bun.lockb ./
COPY src ./src

# ref. https://zenn.dev/gatsby/books/0622aa61e0a3e8/viewer/f04db2
RUN bun install --frozen-lockfile --production
RUN bun run build

ENTRYPOINT [ "bun", "run", "build/index.js" ]