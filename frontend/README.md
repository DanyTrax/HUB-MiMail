# Frontend

Panel web de operacion multiempresa.

Responsabilidades esperadas:
- login y contexto de empresa,
- gestion de cuentas/listas,
- creacion y programacion de tareas,
- monitoreo de ejecuciones y errores,
- trazabilidad por rol y permisos.

## Estado actual

Frontend inicial funcional implementado con:
- login (`email`, `password`, `companySlug`),
- visualizacion de sesion autenticada,
- listado de cuentas de correo,
- creacion de cuenta,
- desactivacion logica de cuenta.

## Seguridad aplicada

- Sin uso de render HTML dinamico inseguro.
- No se usa `innerHTML` para contenido de usuario.
- Entradas normalizadas en cliente antes de enviar.
- Validaciones criticas siguen en backend.
