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
- `POST /auth/microsoft/connect-url` (inicia OAuth2 visual para cuenta Microsoft)
- `GET /auth/microsoft/callback` (callback OAuth2 de Microsoft)
- `GET /protected/health-auth` (Bearer token)
- `GET /protected/scheduler` (roles: `superadmin`, `company_admin`, `scheduler`)
- `GET /protected/operator` (roles: `superadmin`, `company_admin`, `operator`)
- `GET /mail-accounts` (autenticado, filtrado por empresa)
- `POST /mail-accounts` (roles: `superadmin`, `company_admin`, `operator`)
- `PATCH /mail-accounts/:id` (roles: `superadmin`, `company_admin`, `operator`)
- `DELETE /mail-accounts/:id` (desactivacion logica)
- `DELETE /mail-accounts/:id/permanent` (eliminacion definitiva)
- `POST /mail-accounts/:id/destination-secret` (guardar password IMAP destino por cuenta)
- `GET /users` (roles: `superadmin`, `company_admin`)
- `POST /users` (crear/asignar usuario en empresa)
- `PATCH /users/:id/role` (cambiar rol en empresa)
- `GET /oauth-configs/microsoft` (ver configuracion Microsoft por empresa)
- `PUT /oauth-configs/microsoft` (guardar configuracion Microsoft por empresa)
- `POST /jobs/run` (lanzar imapsync desde plataforma)
- `GET /jobs/runs` (historial de ejecuciones)

Notas de OAuth Microsoft:
- La configuracion OAuth (clientId/clientSecret/tenantId/redirectUri/frontendOrigin) se guarda por empresa.
- Si la cuenta Microsoft ya fue conectada por OAuth2, `POST /jobs/run` puede ejecutarse sin enviar `sourceToken`.
- `POST /jobs/run` puede ejecutarse sin `destinationPassword` cuando la cuenta tiene clave destino guardada.
- El backend usa el token guardado y renueva `access_token` automaticamente con `refresh_token` cuando expira.

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
