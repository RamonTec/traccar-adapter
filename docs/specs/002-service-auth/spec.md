---
id: 002-service-auth
status: done           # draft | approved | in-progress | done
requirements: [NFR4]
adrs: [ADR-0002, ADR-0003]
---

# 002 — Service auth: validación de JWT de Keycloak en endpoints S2S

## Problema
Los endpoints de comandos (groups, devices) solo deben poder invocarlos servicios autorizados (ADR-0003). Además, NFR4 exige registrar *quién* ejecuta cada operación.

## Alcance
- Incluye: validación local del JWT (firma JWKS, `iss`, `aud`, `exp`/`nbf`, rol); declaración del rol requerido por endpoint; **denegación por defecto**; identidad del llamante (`actor`) disponible para los handlers y los logs; configuración de Keycloak.
- **No incluye**: obtener tokens (eso lo hace el llamante), autenticación del webhook (008), configuración del realm de Keycloak (solo se documenta), introspección online.

## Comportamiento (criterios de aceptación)
- **AC-1** — SI una request a un endpoint protegido no trae `Authorization: Bearer <token>`, ENTONCES el sistema DEBE responder `401 UNAUTHORIZED`.
- **AC-2** — SI la firma del token no valida con el JWKS del issuer (incluido un `kid` desconocido tras refrescar el JWKS), ENTONCES `401`.
- **AC-3** — SI el token está expirado o con `nbf` futuro, más allá de 30 s de tolerancia de reloj, ENTONCES `401`.
- **AC-4** — SI `iss` ≠ `KEYCLOAK_ISSUER_URL`, o `aud` no contiene `KEYCLOAK_AUDIENCE` (por defecto `traccar-adapter`), ENTONCES `401`.
- **AC-5** — SI el token es válido pero `resource_access.<audience>.roles` no contiene el rol que exige el endpoint, ENTONCES `403 FORBIDDEN`.
- **AC-6** — CUANDO el token es válido y tiene el rol, el handler DEBE ejecutarse con `actor` = claim `azp`, y el log de la request DEBE incluir `actor`.
- **AC-7** — Un endpoint que no declara su rol ni se marca público explícitamente DEBE responder `403` (denegación por defecto). `GET /health*` es público.
- **AC-8** — El JWKS DEBE cachearse. Un `kid` desconocido provoca como máximo un refresco cada 30 s.
- **AC-9** — SI Keycloak no está disponible y no hay clave cacheada para el `kid`, ENTONCES `401` y un log `warn` (nunca `500`).
- **AC-10** — `KEYCLOAK_ISSUER_URL` es obligatoria: si falta, el arranque falla (spec 001, AC-2).
- **AC-11** — Ningún log contiene el token ni el header `Authorization`.

## Contratos externos
- Header `Authorization: Bearer <jwt>`. Roles: `groups:write`, `devices:write` (ADR-0003).
- Env: `KEYCLOAK_ISSUER_URL` (obligatoria), `KEYCLOAK_AUDIENCE` (opcional, por defecto `traccar-adapter`).
- JWKS: `<issuer>/protocol/openid-connect/certs`.

## Preguntas abiertas
_Ninguna._ Resueltas 2026-10-14:
1. Algoritmos → solo `RS256` (lista blanca); cualquier otro `alg` → 401.
