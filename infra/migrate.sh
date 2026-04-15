#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"
MIGRATIONS_DIR="${ROOT_DIR}/backend/db/migrations"

if [ ! -f "${ENV_FILE}" ]; then
  echo "No existe ${ENV_FILE}. Crea tu .env desde .env.example."
  exit 1
fi

if [ ! -d "${MIGRATIONS_DIR}" ]; then
  echo "No existe la carpeta de migraciones: ${MIGRATIONS_DIR}"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

echo "Aplicando migraciones..."
for migration_file in "${MIGRATIONS_DIR}"/*.sql; do
  echo " - Ejecutando $(basename "${migration_file}")"
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${migration_file}"
done

echo "Migraciones aplicadas correctamente."
