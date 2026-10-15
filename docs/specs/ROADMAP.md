# Roadmap de specs

Cada fila es una carpeta `docs/specs/NNN-slug/`. Phase 2 (business rules for GPS flows) = 004-010; 002-003 son habilitadores.

| Spec | Alcance | Requisitos | ADRs | Depende de | Estado |
|------|---------|-----------|------|-----------|--------|
| 001-foundation | config, logging, errores, health | NFR4 (base) | 0001, 0002 | — | done |
| 002-service-auth | guard JWT Keycloak para endpoints S2S | NFR4 (actor) | 0003 | 001 | done |
| 003-traccar-client | cliente HTTP a Traccar (Bearer, timeouts, errores, readiness) | — | 0005 | 001 | done |
| 004-group-create | `POST /groups` get-or-create | FR1, NFR3, NFR4 | 0003, 0005 | 002, 003 | done |
| 005-device-register | `POST /devices` get-or-create + retiro de IMEI | FR2, FR3, NFR3, NFR4, NFR5 | 0003, 0005 | 002, 003 | done |
| 006-device-status | disable / enable idempotentes | FR3, FR4, NFR1, NFR4 | 0003, 0005 | 005 | done |
| 007-normalize | payload Traccar → evento de plataforma (dominio puro) | FR6 | 0004 | 001 | done |
| 008-webhook-ingest | endpoints webhook, token, raw body, orquestación | FR5, FR10 | 0004, 0005 | 007 | done |
| 009-jetstream-publish | streams, publish con dedup, publisher de eventos | FR9, NFR6 | 0004 | 008 | done |
| 010-deadletter-publish | publisher de dead-letter | FR10, NFR6 | 0004 | 009 | tasks listos |
| 011-reconciliation | polling de backfill a Traccar | NFR2 | 0005 | 009 | **diferido** |
| 013-delivery-outbox | buffer local duradero si JetStream no está disponible + drenado | FR9, FR10, NFR2, NFR6 | 0004, 0005, 0007 | 009, 010 | spec draft · ADR-0007 aceptado, pendiente aprobar spec |
| 012-audit-log-port | auditoría de operaciones en application (port), migra `group.create`, alinea 005/006 | NFR4 | 0002, 0006 | 004 | spec draft · antes de implementar 005/006 |

## Por qué 004-006 esperan
Su design depende del comportamiento real de la API de Traccar (detección de `uniqueId` duplicado, si `PUT` exige el objeto completo, filtros de `GET /api/groups`, permisos), que verifica 003-T01. Diseñarlos antes sería suponer.

## Paralelismo
- 007 es dominio puro: puede empezar ya, en paralelo con 001.
- 002 y 003 son independientes entre sí.
- 004 y 005 son independientes entre sí, una vez existan 002 y 003.

## Preguntas del planning
Q1/NFR2 → ADR-0005 §5 (riesgo aceptado, spec 011 diferido) · Q2 → no aplica a este servicio · Q3 → ADR-0005 §2 · Q4 → ADR-0005 §1.
