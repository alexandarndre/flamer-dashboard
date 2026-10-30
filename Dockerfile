# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases .yarn/releases
RUN --mount=type=cache,target=/root/.yarn/berry/cache node .yarn/releases/yarn-*.cjs install --immutable
COPY . .
RUN node .yarn/releases/yarn-*.cjs build && node .yarn/releases/yarn-*.cjs build:server

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/dist dist
COPY --from=build /app/dist-server dist-server
USER node
EXPOSE 3000
CMD ["node", "dist-server/server.mjs"]
