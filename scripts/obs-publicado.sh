#!/usr/bin/env bash
# Prometheus + Grafana sem Docker, coletando as metricas da API ja publicada.
# Uso: ./scripts/obs-publicado.sh [host-da-api] [url-publica-do-grafana]
# Serve para tirar o print do dashboard das 4 metricas de ouro a partir de qualquer Linux (inclusive o Azure Cloud Shell).
set -euo pipefail
ALVO="${1:-accessflow-api-rm550453-brazilsouth.azurewebsites.net}"
ROOT_URL="${2:-http://localhost:3000/}"
DIR="${OBS_DIR:-$HOME/obs}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$DIR" && cd "$DIR"

if [ ! -d prometheus ]; then
  curl -fsSL https://github.com/prometheus/prometheus/releases/download/v2.55.1/prometheus-2.55.1.linux-amd64.tar.gz | tar xz
  mv prometheus-2.55.1.linux-amd64 prometheus
fi
if [ ! -d grafana ]; then
  curl -fsSL https://dl.grafana.com/oss/release/grafana-11.4.0.linux-amd64.tar.gz | tar xz
  mv grafana-v11.4.0 grafana
fi

cat > prometheus.yml <<YML
global:
  scrape_interval: 15s
  evaluation_interval: 15s
rule_files:
  - $REPO/monitoring/rules.yml
scrape_configs:
  - job_name: accessflow-api
    scheme: https
    metrics_path: /metrics
    static_configs:
      - targets: ["$ALVO"]
YML

rm -rf prov && cp -r "$REPO/monitoring/grafana/provisioning" prov
sed -i 's#http://prometheus:9090#http://127.0.0.1:9090#' prov/datasources/prometheus.yml
sed -i "s#/var/lib/grafana/dashboards#$REPO/monitoring/grafana/dashboards#" prov/dashboards/dashboards.yml

pkill -f "prometheus --config.file" || true
pkill -f "grafana server" || true
nohup ./prometheus/prometheus --config.file=prometheus.yml --storage.tsdb.path=prom-data \
  --web.listen-address=127.0.0.1:9090 > prom.log 2>&1 &
cd grafana
GF_PATHS_PROVISIONING="$DIR/prov" GF_PATHS_DATA="$DIR/grafana-data" GF_SERVER_HTTP_PORT=3000 \
  GF_SERVER_ROOT_URL="$ROOT_URL" GF_AUTH_ANONYMOUS_ENABLED=true GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer \
  GF_ANALYTICS_REPORTING_ENABLED=false nohup ./bin/grafana server > ../grafana.log 2>&1 &
echo "Prometheus em 127.0.0.1:9090 e Grafana na porta 3000 (dashboard: /d/accessflow-golden)."
