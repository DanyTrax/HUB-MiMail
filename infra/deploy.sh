#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"

if [ ! -f "${ENV_FILE}" ]; then
  echo "No existe ${ENV_FILE}. Crea tu .env desde .env.example antes de desplegar."
  exit 1
fi

echo "Iniciando despliegue de plataforma..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "Ejecutando healthcheck..."
bash "${ROOT_DIR}/infra/healthcheck.sh"

echo "Despliegue completado."
