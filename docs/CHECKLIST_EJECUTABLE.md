# Checklist Ejecutable - Plataforma de Migracion y Respaldo de Correo

Este checklist esta pensado para ejecutar el proyecto de inicio a fin sin perder control de alcance.
La plataforma cubre migracion y respaldos programados (Microsoft/Google), multiempresa y roles.
La visualizacion webmail (Roundcube/SnappyMail) queda fuera de esta plataforma.

---

## Fase 0 - Preparacion y control de alcance

### Objetivo
Definir exactamente que entra y que no entra para evitar reprocesos.

### Tareas
- [ ] Confirmar alcance funcional:
  - [ ] Multiempresa (tenant por empresa).
  - [ ] Multiusuario con roles y permisos.
  - [ ] Carga de cuentas por lista/CSV.
  - [ ] Tareas manuales y periodicas.
  - [ ] Conectores Microsoft (imapsync) y Google (gyb/imapsync).
  - [ ] Logs y auditoria.
- [ ] Confirmar fuera de alcance:
  - [ ] Webmail para visualizacion (se mantiene externo).
- [ ] Definir criterios de exito por cuenta y por tarea.

### Entregables
- [ ] Documento de alcance (`docs/alcance.md`).
- [ ] Matriz inicial de roles/permisos (`docs/rbac.md`).

### Validacion
- [ ] Aprobacion del alcance por el equipo.

---

## Fase 1 - Estructura inicial del repositorio

### Objetivo
Dejar base estandar para crecer sin deuda tecnica.

### Tareas
- [ ] Crear estructura:
  - [ ] `backend/`
  - [ ] `worker/`
  - [ ] `frontend/`
  - [ ] `infra/`
  - [ ] `docs/`
- [ ] Crear `.gitignore` y `.editorconfig`.
- [ ] Crear `README` tecnico con arquitectura resumida.

### Entregables
- [ ] Estructura visible en repo.
- [ ] Guia de arranque local.

### Validacion
- [ ] Cualquier desarrollador nuevo puede levantar entorno local.

---

## Fase 2 - Infra local y despliegue base

### Objetivo
Tener entorno reproducible en local y VPS.

### Tareas
- [ ] Definir `infra/docker-compose.yml` con:
  - [ ] `postgres`
  - [ ] `redis`
  - [ ] `backend`
  - [ ] `worker`
  - [ ] `frontend`
- [ ] Definir `infra/.env.example` (sin secretos reales).
- [ ] Crear script de despliegue:
  - [ ] `infra/deploy.sh`
  - [ ] `infra/healthcheck.sh`

### Entregables
- [ ] Compose funcional.
- [ ] Script unico de despliegue.

### Validacion
- [ ] `docker compose up -d` levanta todos los servicios.
- [ ] Health checks en verde.

---

## Fase 3 - Base de datos multiempresa

### Objetivo
Asegurar separacion de datos por empresa desde el inicio.

### Tareas
- [ ] Definir esquema inicial:
  - [ ] `companies`
  - [ ] `users`
  - [ ] `memberships` (user-company-role)
  - [ ] `mail_accounts`
  - [ ] `jobs`
  - [ ] `schedules`
  - [ ] `job_runs`
  - [ ] `credentials`
- [ ] Agregar `company_id` en todas las tablas de dominio.
- [ ] Crear migraciones iniciales y seed de `superadmin`.

### Entregables
- [ ] Migraciones versionadas.
- [ ] Seed de arranque.

### Validacion
- [ ] Prueba de aislamiento: un usuario de empresa A no ve empresa B.

---

## Fase 4 - Autenticacion, autorizacion y seguridad

### Objetivo
Controlar acceso por rol y proteger secretos.

### Tareas
- [ ] Implementar login y gestion de sesiones/JWT.
- [ ] Implementar RBAC con permisos granulares:
  - [ ] `companies.manage`
  - [ ] `users.manage`
  - [ ] `accounts.manage`
  - [ ] `jobs.run`
  - [ ] `jobs.schedule`
  - [ ] `logs.view`
- [ ] Cifrar secretos de origen/destino (tokens, passwords).
- [ ] Agregar auditoria de acciones (quien, que, cuando).

### Entregables
- [ ] Modulo de auth + RBAC funcional.
- [ ] Auditoria minima de cambios.

### Validacion
- [ ] Pruebas de permisos por rol.
- [ ] Pruebas negativas (acceso denegado correcto).

---

## Fase 5 - Motor de ejecucion (worker)

### Objetivo
Ejecutar tareas reales de migracion/backup de forma robusta.

### Tareas
- [ ] Implementar cola de trabajos con Redis.
- [ ] Crear adaptador `imapsync`:
  - [ ] Microsoft 365 -> IMAP destino.
  - [ ] IMAP genrico -> IMAP destino.
- [ ] Crear adaptador `gyb` para backup de Google.
- [ ] Estandarizar estados de ejecucion:
  - [ ] `pending`, `running`, `success`, `failed`, `retrying`, `cancelled`.
- [ ] Guardar log por ejecucion con metadatos.

### Entregables
- [ ] Worker corriendo tareas reales.
- [ ] Registros por cuenta/ejecucion.

### Validacion
- [ ] Ejecucion manual exitosa de cuenta piloto Microsoft.
- [ ] Ejecucion manual exitosa de cuenta piloto Google.

---

## Fase 6 - Programacion periodica y lotes

### Objetivo
Permitir operaciones masivas y tareas automaticas.

### Tareas
- [ ] Carga de cuentas por CSV.
- [ ] Crear tareas por lote (N cuentas).
- [ ] Programacion por cron:
  - [ ] diaria
  - [ ] cada X horas
  - [ ] semanal
- [ ] Politica de backup no destructiva (append-only).
- [ ] Reintentos y control de concurrencia por empresa.

### Entregables
- [ ] Scheduler funcional.
- [ ] Lotes por archivo CSV.

### Validacion
- [ ] Cron dispara tareas a la hora definida.
- [ ] No hay eliminacion no deseada en destino backup.

---

## Fase 7 - Frontend operativo

### Objetivo
Dar operacion simple por empresa y por rol.

### Tareas
- [ ] Pantalla de login y seleccion de empresa.
- [ ] CRUD de empresas (segun rol).
- [ ] CRUD de usuarios y asignacion de roles.
- [ ] CRUD de cuentas de correo y listas.
- [ ] Crear/ejecutar tareas.
- [ ] Programar tareas periodicas.
- [ ] Ver historial, estado, errores y reintentos.

### Entregables
- [ ] UI funcional para flujo completo.

### Validacion
- [ ] Operador puede ejecutar flujo sin tocar consola.

---

## Fase 8 - Deploy, backup y restore de la plataforma

### Objetivo
Asegurar continuidad operativa y portabilidad entre entornos.

### Tareas
- [ ] Crear script `infra/backup.sh`:
  - [ ] dump de PostgreSQL
  - [ ] export de configuraciones necesarias
  - [ ] empaquetado con fecha
- [ ] Crear script `infra/restore.sh`:
  - [ ] restaurar DB
  - [ ] restaurar configuraciones
  - [ ] validar integridad basica
- [ ] Definir politica de retencion.
- [ ] (Opcional) subir backups a almacenamiento externo.

### Entregables
- [ ] Procedimiento de backup/restore documentado.

### Validacion
- [ ] Restore exitoso en entorno limpio (simulacion DR).

---

## Fase 9 - QA final y salida a produccion

### Objetivo
Reducir riesgo antes de uso en empresas reales.

### Tareas
- [ ] Pruebas funcionales por rol.
- [ ] Pruebas de aislamiento multiempresa.
- [ ] Pruebas de carga basica (lotes).
- [ ] Pruebas de fallos controlados (token invalido, timeout, caida IMAP).
- [ ] Checklist de seguridad (secrets, TLS, logs, acceso).

### Entregables
- [ ] Acta de salida a produccion (`docs/go-live.md`).

### Validacion
- [ ] Piloto real aprobado en una empresa.

---

## Bloque de decisiones obligatorias (antes de codificar modulos)

- [ ] Stack backend final (NestJS o FastAPI).
- [ ] ORM final (Prisma/TypeORM/SQLAlchemy).
- [ ] Estrategia de cifrado de secretos.
- [ ] Politica de retencion de logs y backups.
- [ ] Modo Google principal:
  - [ ] solo GYB
  - [ ] GYB + copia IMAP adicional

---

## Comandos operativos sugeridos (cuando exista infra)

```bash
# Levantar entorno local
docker compose -f infra/docker-compose.yml up -d

# Ver estado de servicios
docker compose -f infra/docker-compose.yml ps

# Ver logs de backend
docker compose -f infra/docker-compose.yml logs -f backend

# Ejecutar backup de plataforma
bash infra/backup.sh

# Restaurar en otro entorno
bash infra/restore.sh /ruta/al/backup.tar.gz
```

---

## Criterio de cierre del proyecto

- [ ] Multiempresa funcionando con aislamiento comprobado.
- [ ] Roles y permisos aplicados en API/UI.
- [ ] Migracion/backup manual y periodico operativo.
- [ ] Logs y auditoria por empresa y por tarea.
- [ ] Deploy automatizado en VPS.
- [ ] Backup/restore de plataforma probado.
