---
id: 004-group-create
status: draft          # draft | approved | in-progress | done
requirements: [FR1, NFR3, NFR4]
adrs: [ADR-0002, ADR-0003, ADR-0005]
---

# 004 — Group create: crear un group en Traccar a petición de core-service

## Problema
core-service necesita un group de Traccar por cada cliente, creado en el onboarding (FR1) y no de forma perezosa. La operación tiene que ser segura ante reintentos (NFR3) y quedar auditada (NFR4).

## Alcance
- Incluye: `POST /groups` con semántica *get-or-create* por nombre exacto (ADR-0005 §3).
- **No incluye**: listar, obtener, renombrar ni borrar groups; groups anidados; semántica de tenant (`name` es una clave opaca que define core-service).

## Comportamiento (criterios de aceptación)
- **AC-1** — CUANDO llega `POST /groups {"name": N}` y no existe ningún group con nombre exactamente `N`, el sistema DEBE crearlo en Traccar sin group padre y responder `201 {"groupId", "name"}`.
- **AC-2** — CUANDO ya existe exactamente un group con nombre `N` (comparación exacta, sensible a mayúsculas), el sistema NO DEBE crear otro y DEBE responder `200` con su `groupId`.
- **AC-3** — SI existen dos o más groups con nombre `N` en Traccar, ENTONCES `409` con `code: "GROUP_NAME_AMBIGUOUS"`, sin crear nada.
- **AC-4** — SI `name` falta, no es string, queda vacío tras `trim`, supera 128 caracteres o el body trae campos no declarados, ENTONCES `400 VALIDATION_ERROR` con `details`.
- **AC-5** — SI Traccar no está disponible, ENTONCES `503 UPSTREAM_UNAVAILABLE`. Un reintento posterior con el mismo `N` es seguro (AC-2).
- **AC-6** — El endpoint exige el rol `groups:write` (ADR-0003).
- **AC-7** — Cada ejecución DEBE loguear `op: "group.create"`, `actor`, `name`, `groupId` (si lo hay), `result` (`created|existing|ambiguous|failed`) y `durationMs` (NFR4).
- **AC-8** — No existe ningún otro endpoint que modifique groups.

## Contratos externos
```
POST /groups            Authorization: Bearer <jwt con groups:write>
{ "name": "string 1..128" }
201|200 { "groupId": number, "name": string }
400 VALIDATION_ERROR · 401 · 403 · 409 GROUP_NAME_AMBIGUOUS · 503 UPSTREAM_UNAVAILABLE
```

## Preguntas abiertas
1. Librería para validar DTOs (pendiente desde 001). *Propuesta: zod, que ya se usa para la config.*
