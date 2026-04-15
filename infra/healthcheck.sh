#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"

if [ ! -f "${ENV_FILE}" ]; then
  echo "No existe ${ENV_FILE}. Crea tu .env desde .env.example."
  exit 1
fi

echo "Estado de servicios:"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

echo "Validando PostgreSQL..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

echo "Validando Redis..."
REDIS_PING="$(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T redis redis-cli ping)"
if [ "${REDIS_PING}" != "PONG" ]; then
  echo "Redis no responde correctamente: ${REDIS_PING}"
  exit 1
fi

echo "Healthcheck OK."
