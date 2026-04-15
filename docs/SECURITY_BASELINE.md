# Baseline de Seguridad (Backend y Frontend)

## Objetivo

Evitar ejecucion de scripts inyectados y reducir riesgo de XSS/inyeccion desde formularios.

## Reglas obligatorias de backend

- Validar y normalizar todo input de formularios antes de procesar.
- Rechazar patrones peligrosos (`<script`, `javascript:`, `onerror=`, `onload=`).
- Usar consultas SQL parametrizadas exclusivamente.
- No renderizar HTML recibido desde cliente.
- Activar headers de seguridad (`helmet`).
- Limitar intentos en endpoints sensibles (`/auth/login`).

## Reglas obligatorias de frontend

- Nunca usar `dangerouslySetInnerHTML` ni equivalentes.
- Mostrar texto de usuario solo como texto plano (escape por defecto del framework).
- Validar campos en cliente, pero confiar solo en validacion backend.
- Sanitizar entradas antes de enviarlas (trim, longitud, charset permitido).
- Aplicar Content Security Policy estricta en produccion.
- Bloquear carga de scripts inline y origenes no autorizados.

## Checklist de revisión de PR

- [ ] ¿Cada campo nuevo tiene validacion y longitud maxima?
- [ ] ¿No existe render de HTML de usuario?
- [ ] ¿No se concatenan strings en SQL?
- [ ] ¿Endpoints nuevos tienen autenticacion/roles?
- [ ] ¿Hay pruebas de intento de payload XSS basico?
