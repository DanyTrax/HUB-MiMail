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

Usuario demo de desarrollo (seed):
- email: `admin@hub.local`
- password: `Admin123*`
- companySlug: `empresa-demo`
