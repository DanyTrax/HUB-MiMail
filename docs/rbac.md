# Matriz Inicial de Roles (RBAC)

## Roles
- `superadmin`: acceso global a todas las empresas.
- `company_admin`: administra una o mas empresas asignadas.
- `operator`: ejecuta tareas y administra cuentas dentro de empresas asignadas.
- `scheduler`: gestiona programaciones periodicas.
- `viewer`: solo lectura de estado, logs e historial.

## Permisos iniciales sugeridos

| Permiso | superadmin | company_admin | operator | scheduler | viewer |
|---|---:|---:|---:|---:|---:|
| `companies.manage` | si | no | no | no | no |
| `users.manage` | si | si | no | no | no |
| `accounts.manage` | si | si | si | no | no |
| `jobs.run` | si | si | si | no | no |
| `jobs.schedule` | si | si | no | si | no |
| `logs.view` | si | si | si | si | si |
| `audit.view` | si | si | no | no | si |
