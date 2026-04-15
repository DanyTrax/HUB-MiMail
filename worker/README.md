# Worker

Servicio de ejecucion de tareas.

Responsabilidades esperadas:
- ejecutar jobs manuales y periodicos,
- invocar conectores (`imapsync`, `gyb`),
- manejar reintentos, timeouts y concurrencia,
- registrar logs de ejecucion por cuenta y empresa.
