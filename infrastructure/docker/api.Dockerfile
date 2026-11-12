# syntax=docker/dockerfile:1.7
# Build context: repository root.  docker build -f infrastructure/docker/api.Dockerfile --build-arg VERSION=1.0.0 .
FROM rust:1-bookworm AS build
ARG VERSION=0.0.0-dev
ENV SHIKKHAOS_VERSION=${VERSION} SQLX_OFFLINE=true CARGO_INCREMENTAL=0
WORKDIR /src
COPY apps/api/Cargo.toml apps/api/Cargo.lock apps/api/rust-toolchain.toml ./apps/api/
COPY apps/api/crates ./apps/api/crates
COPY database ./database
RUN --mount=type=cache,target=/usr/local/cargo/registry --mount=type=cache,target=/src/apps/api/target \
    cd apps/api && cargo build --release --locked --bin shikkhaos-api && cp target/release/shikkhaos-api /shikkhaos-api

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home /app --shell /usr/sbin/nologin shikkhaos && mkdir -p /app/data/files && chown -R shikkhaos /app
COPY --from=build /shikkhaos-api /usr/local/bin/shikkhaos-api
USER shikkhaos
WORKDIR /app
ENV BIND_ADDR=0.0.0.0:8080 STORAGE_DIR=/app/data/files RUST_LOG=info
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD curl -fsS http://127.0.0.1:8080/api/v1/health || exit 1
ENTRYPOINT ["shikkhaos-api"]
CMD ["serve"]
