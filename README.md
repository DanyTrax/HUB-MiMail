# Hub Migracion Correo

Este repositorio contiene la plataforma para orquestar migraciones de correo entre Microsoft 365 y cPanel/IMAP, con enfoque en cero perdida durante el cutover de DNS/MX.

## Pasos Previos Antes de Iniciar

### 1) Alcance y criterios de exito
- Definir cuentas a migrar, volumen estimado y ventana de cambio.
- Confirmar criterio de cierre por cuenta (por ejemplo, 2 deltas consecutivos sin mensajes nuevos).
- Acordar responsables (tecnico, aprobador, soporte usuario final).

### 2) Inventario tecnico
- Listado de cuentas origen (M365) y destino (cPanel), incluyendo alias.
- Validar que cada cuenta exista en cPanel y autentique por IMAP.
- Verificar conectividad desde VPS a `outlook.office365.com:993` y a IMAP destino.

### 3) Seguridad y secretos
- Definir gestion de secretos: tokens OAuth, contrasenas de destino y claves de app.
- Nunca registrar tokens en logs de aplicacion o consola.
- Establecer rotacion y limpieza de secretos post-migracion.

### 4) OAuth y permisos M365
- Confirmar permisos OAuth necesarios (IMAP delegado o app-only segun estrategia).
- Verificar consentimiento de administrador y redirecciones configuradas.
- Probar login IMAP con token en 1 cuenta piloto antes de escalar.

### 5) Estrategia de migracion (sin perdida)
- Ejecutar corrida inicial por cuenta (bulk copy).
- Ejecutar deltas periodicos mientras MX siga en Microsoft.
- Programar delta final inmediatamente antes y despues del cambio de MX.
- Mantener M365 activo en modo coexistencia temporal para capturar rezagados.

### 6) DNS/MX y plan de corte
- Bajar TTL de MX 24-48h antes (ejemplo: 300s).
- Definir hora de corte y ventana de observacion.
- Documentar rollback (a donde volver MX si hay incidencia).

### 7) Observabilidad y control
- Definir tablero de estado por cuenta: pendiente, en curso, ok, error.
- Guardar logs por trabajo y resumen por carpeta/mensajes.
- Alertas para errores de autenticacion, timeout y limite de cuota.

### 8) QA y validacion funcional
- Validar carpetas especiales (Sent, Trash, Drafts, Junk).
- Comparar conteos por carpeta entre origen y destino.
- Probar envio/recepcion en cPanel antes de cierre definitivo.

### 9) Operacion y soporte
- Definir protocolo de comunicacion a usuarios.
- Checklist de post-corte (cliente Outlook/Thunderbird/webmail).
- Criterio de cierre final del proyecto y acta de aceptacion.

## Siguiente Paso Recomendado

Crear la estructura base del proyecto:
- `backend/`
- `worker/`
- `frontend/`
- `infra/` (docker compose y deploy en Dockge)
- `docs/` (runbooks y procedimiento de cutover)

## Checklist Ejecutable

Para iniciar implementacion paso a paso (arquitectura, seguridad, multiempresa, scheduler, deploy, backup/restore), usa:

- `docs/CHECKLIST_EJECUTABLE.md`
- `docs/DEPLOY_VPS_SSH.md`

## Estructura Inicial Creada

- `backend/`
- `worker/`
- `frontend/`
- `infra/`
- `docs/alcance.md`
- `docs/rbac.md`
- `.env.example`

## Fase 2 - Infra Base

Archivos creados para despliegue inicial:

- `infra/docker-compose.yml`
- `infra/deploy.sh`
- `infra/healthcheck.sh`
- `infra/migrate.sh`
- `infra/seed.sh`

Pasos:

```bash
cp .env.example .env
bash infra/deploy.sh
bash infra/migrate.sh
bash infra/seed.sh
```
