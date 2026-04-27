FROM golang:1.26-alpine AS build

RUN apk add --no-cache git
RUN git clone --depth 1 https://github.com/railwayapp/railpack.git /src/railpack
WORKDIR /src/railpack
RUN go build -o /out/railpack ./cmd/cli

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates bash curl git xz-utils unzip docker.io \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/railpack /usr/local/bin/railpack

ENTRYPOINT ["railpack"]

