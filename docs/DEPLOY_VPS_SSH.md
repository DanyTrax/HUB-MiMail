# Deploy en VPS por SSH (paso a paso)

Esta guia levanta el proyecto como stack independiente, sin afectar otros stacks actuales.

## 1) Conectarte por SSH

```bash
ssh root@TU_IP_VPS
```

## 2) Clonar repositorio

```bash
cd /opt
git clone https://github.com/DanyTrax/HUB-MiMail.git
cd HUB-MiMail
```

## 3) Crear variables de entorno

```bash
cp .env.example .env
nano .env
```

Valores minimos a revisar:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `POSTGRES_PORT` y `REDIS_PORT` (si hay conflictos)

Puertos sugeridos sin choque:
- `POSTGRES_PORT=55432`
- `REDIS_PORT=56379`

## 4) Levantar servicios base

```bash
bash infra/deploy.sh
```

## 5) Crear esquema de base de datos

```bash
bash infra/migrate.sh
```

## 6) Cargar seed inicial

```bash
bash infra/seed.sh
```

## 7) Validar estado

```bash
bash infra/healthcheck.sh
docker compose --env-file .env -f infra/docker-compose.yml ps
```

## 8) Actualizar proyecto en el futuro

```bash
cd /opt/HUB-MiMail
git pull
bash infra/deploy.sh
# Si hay cambios de DB:
bash infra/migrate.sh
# Si cambian datos demo o permisos iniciales:
bash infra/seed.sh
```

## 9) Probar login base de API

```bash
curl -s -X POST http://TU_IP_VPS:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hub.local","password":"Admin123*","companySlug":"empresa-demo"}'
```

## Notas importantes

- Este proyecto es un stack aparte del resto.
- No reemplaza tu stack actual de Dockge.
- Si quieres, luego puedes administrarlo tambien desde Dockge importando este compose.
- Para automatizar despliegues por push, revisa `docs/CI_CD_DEPLOY.md`.
