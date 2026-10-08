FROM alpine:3.24

ARG PB_VERSION=0.40.4
ARG TARGETARCH

RUN apk add --no-cache ca-certificates

RUN set -e; \
    zip="pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip"; \
    base="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"; \
    mkdir /tmp/pb; \
    cd /tmp/pb; \
    wget -q "${base}/${zip}" "${base}/checksums.txt"; \
    grep " ${zip}\$" checksums.txt > zip.sha256; \
    sha256sum -c zip.sha256; \
    mkdir -p /pb; \
    unzip -o "${zip}" pocketbase -d /pb; \
    cd /; \
    rm -rf /tmp/pb

EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations"]
