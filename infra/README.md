# Infra

Infraestructura de despliegue y operacion.

Contenido esperado:
- `docker-compose.yml` para entorno local/VPS,
- scripts `deploy.sh`, `healthcheck.sh`, `migrate.sh`, `seed.sh`, `backup.sh`, `restore.sh`,
- configuracion de health checks,
- guias de despliegue en Dockge.

## Uso inicial

1. Crear archivo `.env` en la raiz del proyecto:

```bash
cp .env.example .env
```

2. Desplegar servicios base:

```bash
bash infra/deploy.sh
```

3. Verificar salud:

```bash
bash infra/healthcheck.sh
```

4. Aplicar esquema de base de datos:

```bash
bash infra/migrate.sh
```

5. Cargar seed inicial:

```bash
bash infra/seed.sh
```
