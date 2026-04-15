# CI/CD - Deploy automático a VPS

Este flujo permite desplegar la plataforma automáticamente al hacer `push` a `main`.

## 1) Requisitos en VPS

- Proyecto clonado en servidor, por ejemplo: `/opt/HUB-MiMail`
- `.env` ya creado y validado.
- Docker y Docker Compose operativos.

## 2) Usuario recomendado para deploy

Puedes usar `root`, pero se recomienda un usuario dedicado (`deploy`) con permisos sobre Docker y la carpeta del proyecto.

## 3) Clave SSH para GitHub Actions

En tu máquina local:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ./github_actions_deploy_key
```

Te generará:
- `github_actions_deploy_key` (privada)
- `github_actions_deploy_key.pub` (pública)

Agregar la pública al VPS (`~/.ssh/authorized_keys` del usuario de deploy).

## 4) Secrets en GitHub

En el repo: `Settings -> Secrets and variables -> Actions -> New repository secret`

Crear estos secrets:
- `VPS_HOST` -> IP o dominio del VPS
- `VPS_USER` -> usuario SSH (ejemplo: `root` o `deploy`)
- `VPS_SSH_KEY` -> contenido completo de la llave privada
- `VPS_PROJECT_PATH` -> ruta del proyecto en VPS (ej: `/opt/HUB-MiMail`)

## 5) Workflow incluido

Archivo:
- `.github/workflows/deploy.yml`

Se ejecuta en:
- push a `main`
- ejecución manual (`workflow_dispatch`)

## 6) Qué hace el deploy

En VPS ejecuta:
- validación de working tree limpio,
- `git pull --ff-only origin main`,
- `bash infra/deploy.sh`,
- `bash infra/migrate.sh`,
- `bash infra/healthcheck.sh`.

## 7) Si falla por cambios locales en VPS

El workflow aborta por seguridad si detecta cambios locales no comprometidos.

Resolver en VPS:

```bash
cd /opt/HUB-MiMail
git status
```

Luego:
- confirmar/guardar cambios locales, o
- descartarlos manualmente si sabes que no se necesitan.
