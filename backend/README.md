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
