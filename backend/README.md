# Backend

API principal de la plataforma.

Responsabilidades esperadas:
- autenticacion y autorizacion (RBAC),
- gestion multiempresa,
- gestion de cuentas, tareas y programacion,
- endpoints de monitoreo y auditoria.

Stack sugerido inicial:
- Node.js + NestJS,
- PostgreSQL,
- Redis (cola/scheduler via worker).

## Base de datos

Esquema inicial y seed:
- `db/migrations/001_init.sql`
- `db/seeds/001_seed_superadmin.sql`

Ejecucion recomendada desde raiz:

```bash
bash infra/migrate.sh
bash infra/seed.sh
```

## API base implementada (Fase 4 inicial)

Servidor Express con JWT y RBAC basico:
- `GET /health`
- `POST /auth/login`
- `GET /auth/me` (Bearer token)
- `GET /protected/health-auth` (Bearer token)
- `GET /protected/scheduler` (roles: `superadmin`, `company_admin`, `scheduler`)
- `GET /protected/operator` (roles: `superadmin`, `company_admin`, `operator`)
- `GET /mail-accounts` (autenticado, filtrado por empresa)
- `POST /mail-accounts` (roles: `superadmin`, `company_admin`, `operator`)
- `PATCH /mail-accounts/:id` (roles: `superadmin`, `company_admin`, `operator`)
- `DELETE /mail-accounts/:id` (desactivacion logica)
- `GET /users` (roles: `superadmin`, `company_admin`)
- `POST /users` (crear/asignar usuario en empresa)
- `PATCH /users/:id/role` (cambiar rol en empresa)

Usuario demo de desarrollo (seed):
- email: `admin@hub.local`
- password: `Admin123*`
- companySlug: `empresa-demo`

## Seguridad aplicada

- Headers de seguridad con `helmet`.
- Limitacion de intentos en `/auth` con `express-rate-limit`.
- Validacion y normalizacion estricta de inputs en login y cuentas.
- Rechazo de patrones peligrosos (`<script>`, `javascript:`, handlers inline).
- Consultas SQL parametrizadas (sin interpolacion directa).
