---
id: 003-T01
status: todo           # todo | doing | blocked | done
depends_on: []
covers: [AC-8]
---

# 003-T01 — Verify Traccar 6.15.3 API and write traccar-api skill

## Objetivo
Sustituir lo que "recordamos" de la API de Traccar por respuestas **reales** de la instancia 6.15.3, guardadas como skill reutilizable para 004-006.

## Requisito humano (antes de empezar)
1. El usuario crea en Traccar un usuario de servicio (p.ej. `traccar-adapter`) y genera su token de API.
2. El usuario exporta en su shell `TRACCAR_BASE_URL=http://localhost:8082` y `TRACCAR_API_TOKEN=<token>`. **El token nunca se pega en el chat ni se guarda en archivos.**
Si falta alguno → `status: blocked`.

## Contexto (leer SOLO esto)
- `docs/decisions/0005-traccar-integration.md`
- `docs/sdd/skills/automated-testing/SKILL.md` (solo como modelo de formato de skill)

## Contrato (qué verificar con `curl -H "Authorization: Bearer $TRACCAR_API_TOKEN"`)
| # | Llamada | Capturar |
|---|---------|----------|
| 1 | `GET /api/server` | status y `version` |
| 2 | `POST /api/groups {"name":"sdd-probe-<ts>"}` | body de respuesta (campos) |
| 3 | `GET /api/groups` | forma de la lista; ¿filtra por usuario? |
| 4 | `POST /api/devices {"name","uniqueId","groupId"}` | body de respuesta |
| 5 | `POST /api/devices` con el mismo `uniqueId` | status y body del duplicado |
| 6 | `GET /api/devices?uniqueId=<x>` | ¿encuentra devices deshabilitados? |
| 7 | `GET /api/devices/{id}` | status cuando no existe |
| 8 | `PUT /api/devices/{id}` con el objeto completo y `disabled:true` | ¿exige el objeto completo? ¿qué pasa si falta `groupId`? |
| 9 | `PUT` cambiando `uniqueId` de un device deshabilitado | permitido o no |
| 10 | Cualquier llamada con un token inválido | status (¿401?) |
| 11 | Permisos: repetir 2 y 4 con un usuario no-admin | permisos mínimos necesarios |

Limpieza: deshabilitar los devices de prueba y renombrar los groups `sdd-probe-*` (no se borran: soft delete).

## Archivos a crear/modificar
- [ ] `docs/sdd/skills/traccar-api/SKILL.md` (nuevo): `description` con disparadores (Traccar, devices, groups, uniqueId), reglas de uso y permisos mínimos.
- [ ] `docs/sdd/skills/traccar-api/reference.md` (nuevo): por cada fila, request, status y body de respuesta **reales** (anonimizar IMEIs y nombres). Fecha y versión verificadas.
- [ ] `pnpm sdd:sync`

## Criterios de aceptación
- [ ] **AC-8a** — Las 11 filas están documentadas con datos observados, no supuestos. Las que no se pudieron verificar se marcan `NO VERIFICADO`.
- [ ] **AC-8b** — Queda explícito cómo detectar un `uniqueId` duplicado (status y mensaje) y si `PUT` exige el objeto completo.
- [ ] **AC-8c** — Ningún token, contraseña ni IMEI real en los archivos.
- [ ] **AC-8d** — `pnpm check` en verde (el sync de skills incluido).

## Fuera de alcance
- Código. Cambiar `traccar.xml`.

## Verificación
```bash
pnpm sdd:sync && pnpm check
```

## Handoff
