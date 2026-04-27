FROM node:20-alpine AS build

WORKDIR /app/client

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine

WORKDIR /app/client

COPY --from=build /app/client/package.json /app/client/package-lock.json* ./

RUN npm ci

COPY --from=build /app/client/dist ./dist

EXPOSE 4173

CMD ["npm","run","preview","--","--host","0.0.0.0","--port","4173","--strictPort"]

