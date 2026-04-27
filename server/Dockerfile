FROM node:20-alpine

WORKDIR /app/server

RUN apk add --no-cache bash git docker-cli

COPY package.json package-lock.json* ./

RUN npm ci

COPY tsconfig.json tsconfig.json

COPY src ./src

EXPOSE 3001

CMD ["npm","run","dev"]

