# Roles y permisos

Este documento describe el modelo de roles de sistema introducido en la
migración `supabase/migrations/0005_system_roles.sql`.

## Dos ejes de autorización, independientes

1. **Rol de sistema** (`profiles.system_role`): qué puede hacer una persona
   a nivel de plataforma (usar el intérprete global, moderarlo, administrar
   usuarios). Valores: `user` (por defecto), `delegate`, `admin`.
2. **Membership de Casa** (`home_members`): a qué Casas ("hogares") tiene
   acceso una persona y con qué rol dentro de ella (`owner`/`member`/`guest`).

**Estos dos ejes no se mezclan.** Ser `admin` o `delegate` **no** añade
membership a ninguna Casa, ni dispensa de las políticas RLS de
`home_members`/`get_my_home_ids()`. Un admin sólo ve los datos de las Casas
de las que sea miembro, exactamente igual que cualquier otro usuario. El
acceso administrativo es sobre el conocimiento *global* de la plataforma
(intérprete de productos, gestión de usuarios), nunca sobre los datos
domésticos privados de una Casa ajena.

## Matriz de permisos

| Acción                        | user | delegate | admin |
|--------------------------------|:---:|:---:|:---:|
| Usar la app                    | Sí  | Sí  | Sí  |
| Acceder a sus Casas             | Sí  | Sí  | Sí  |
| Proponer interpretación         | Sí  | Sí  | Sí  |
| Moderar el intérprete           | No  | Sí  | Sí  |
| Aprobar propuestas              | No  | Sí  | Sí  |
| Gestionar usuarios               | No  | No  | Sí  |
| Cambiar roles                    | No  | No  | Sí  |
| Configuración global             | No  | No  | Sí  |

## Rutas administrativas

| Ruta                             | Acceso mínimo | Qué hace |
|-----------------------------------|---------------|----------|
| `/admin`                          | `admin`       | Dashboard: métricas básicas + accesos a las secciones |
| `/admin/users`                    | `admin`       | Buscar/filtrar usuarios, cambiar su rol |
| `/admin/interpreter`              | `delegate`    | Diccionario global aprobado (buscar, activar/desactivar alias) |
| `/admin/interpreter/pending`      | `delegate`    | Cola de propuestas pendientes/en conflicto: aprobar, editar y aprobar, rechazar |
| `/admin/interpreter/conflicts`    | `delegate`    | Conflictos agrupados por (retailer, texto normalizado); elegir la interpretación correcta |
| `/admin/products`                 | `delegate`    | Buscar y editar productos canónicos/de tienda, detectar posibles duplicados |
| `/admin/audit`                    | `admin`       | Historial de `admin_audit_log` |

La protección se hace en servidor: `app/(app)/admin/layout.tsx` exige como
mínimo `delegate` para toda la sección, y cada `page.tsx` vuelve a comprobar
su propio mínimo (p. ej. `/admin/users` y `/admin/audit` exigen `admin`) y
devuelve `notFound()` si no se cumple. Cada RPC de escritura (`set_user_role`,
`approve_interpreter_proposal`, etc.) repite la misma comprobación de rol en
el propio SQL, así que ni una ruta mal protegida ni una llamada directa a
`supabase.rpc(...)` desde la consola del navegador puede saltarse el control.
Ocultar la entrada de navegación en `/perfil` o en `app/(app)/admin/layout.tsx`
es sólo cosmético.

Ver [`docs/INTERPRETER_ARCHITECTURE.md`](./INTERPRETER_ARCHITECTURE.md) para
el detalle del modelo de datos y el flujo de moderación del intérprete.

## Helpers de autorización (`lib/roles.ts`)

- `getCurrentSystemRole()` — rol del usuario autenticado (`null` si no hay sesión).
- `isAdmin()`, `isDelegate()`
- `canModerateInterpreter()` — `delegate` o `admin`
- `canManageUsers()` — sólo `admin`

Usar siempre estos helpers en vez de comparar `role === "admin"` disperso
por el código.

## Seguridad del campo `system_role`

- Un usuario **no puede** cambiar su propio `system_role`: la política
  `profiles_update_own` permite actualizar la propia fila de `profiles`,
  pero un trigger (`protect_system_role`) bloquea cualquier `UPDATE` que
  modifique esa columna salvo que provenga de las funciones privilegiadas de
  abajo (usan `set_config('app.system_role_change_authorized', ...)` para
  autorizarse a sí mismas dentro de la misma transacción).
- Todo cambio de rol pasa por `set_user_role(target_user_id, new_role)` o
  `set_user_role_by_email(email, new_role)`, funciones `SECURITY DEFINER`
  que comprueban en el propio backend SQL que quien llama tiene
  `system_role = 'admin'` (no se confía en ninguna comprobación de
  frontend). Un admin tampoco puede quitarse a sí mismo el rol de admin con
  esta función (evita bloqueos accidentales).
- Cada cambio de rol queda registrado en `admin_audit_log`
  (`actor_user_id`, `action`, `target_type`, `target_id`, `metadata`,
  `created_at`), legible sólo por administradores.

## Cómo crear el primer administrador

No hay ningún email hardcodeado en el repositorio. El primer admin se crea
ejecutando **una vez**, desde el SQL Editor del dashboard de Supabase (o la
CLI, conectado con privilegios de propietario — nunca desde la app ni desde
`supabase.rpc(...)` en el cliente, que no tiene permiso para invocar esta
función):

```sql
select public.bootstrap_first_admin('email-de-la-persona@ejemplo.com');
```

Esta función:

- sólo funciona si **todavía no existe ningún administrador** en la tabla
  `profiles` (falla explícitamente si ya hay uno — usa `set_user_role_by_email`
  para promover admins adicionales a partir de ahí);
- exige que el email pertenezca a una cuenta ya registrada;
- tiene revocado el `EXECUTE` para los roles `anon`/`authenticated`, así que
  no es invocable desde la API pública/PostgREST bajo ninguna circunstancia,
  sólo desde una conexión con privilegios de propietario (SQL Editor, CLI).

## Cómo asignar un delegado (o cambiar cualquier rol)

Como administrador, desde `/admin/users`, o directamente por SQL/RPC:

```sql
select public.set_user_role_by_email('persona@ejemplo.com', 'delegate');
```

## Intérprete global de productos

Implementado en `supabase/migrations/0006_interpreter_and_admin.sql` (ver
[`docs/INTERPRETER_ARCHITECTURE.md`](./INTERPRETER_ARCHITECTURE.md) para el
detalle). Resumen de la regla de escritura: un `user` normal sólo puede
crear/confirmar filas en `interpreter_proposals` (vía
`submit_interpreter_proposal`), nunca escribir directamente en
`product_aliases`, `canonical_products` o `retailer_products`. `delegate` y
`admin` moderan esas propuestas (aprobar, editar y aprobar, rechazar,
resolver conflictos) y pueden corregir el conocimiento ya aprobado, siempre
a través de funciones `SECURITY DEFINER` que repiten la comprobación de rol
en el propio SQL — nunca hay una política RLS de `INSERT`/`UPDATE` directa
sobre esas tablas.
