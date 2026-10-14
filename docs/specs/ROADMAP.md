# Roadmap de specs (propuesta, sin specs escritos aún)

Orden sugerido; cada fila se convierte en `docs/specs/NNN-slug/` con `/sdd-spec`.

| Spec | Alcance | Requisitos | Bloqueado por |
|------|---------|-----------|---------------|
| 001-foundation | config validada, logger estructurado + correlationId, exception filter, health, limpiar boilerplate | NFR4 (base) | — |
| 002-traccar-client | cliente HTTP base a Traccar (auth, errores, timeouts) | — | Q4 (auth Traccar) |
| 003-group-create | `POST /groups` → crea group en Traccar | FR1, NFR3, NFR4 | 002 |
| 004-device-register | `POST /devices` → crea device en group | FR2, FR3, NFR3, NFR4, NFR5 | 002 |
| 005-device-status | disable / enable device | FR4, NFR1, NFR4 | 004 |
| 006-webhook-ingest | endpoint webhook + token compartido | FR5 | Q3 (header traccar.xml) |
| 007-normalize | payload Traccar → evento de plataforma | FR6 | 006 |
| 008-publish-events | JetStream `telemetry.events`, `Nats-Msg-Id`, streams con retención | FR9, NFR6 | 007 |
| 009-deadletter | JetStream `telemetry.deadletter` para todo fallo | FR10, NFR6 | 006 |

Preguntas abiertas del planning que afectan: Q1/NFR2 (reconciliación por polling) → decidir antes de cerrar 008; Q2 no aplica a este servicio.
