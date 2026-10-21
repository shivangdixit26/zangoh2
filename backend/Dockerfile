FROM node:22-alpine
WORKDIR /app
COPY package.json ./
# tsx runs the TypeScript sources directly; typescript itself is only needed for `npm run typecheck`.
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node_modules/.bin/tsx", "src/index.ts"]
