#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"
SEED_FILE="${ROOT_DIR}/backend/db/seeds/001_seed_superadmin.sql"

if [ ! -f "${ENV_FILE}" ]; then
  echo "No existe ${ENV_FILE}. Crea tu .env desde .env.example."
  exit 1
fi

if [ ! -f "${SEED_FILE}" ]; then
  echo "No existe el archivo seed: ${SEED_FILE}"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

echo "Aplicando seed inicial..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${SEED_FILE}"

echo "Seed aplicado correctamente."
