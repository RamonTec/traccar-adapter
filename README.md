# traccar-adapter

Adapter (anti-corruption layer) entre la plataforma de telemetría y Traccar. Único servicio que conoce Traccar; habla solo de **Device** y **Group**.

- Producto: [docs/product/planning.md](docs/product/planning.md)
- Flujo de trabajo SDD: [docs/sdd/WORKFLOW.md](docs/sdd/WORKFLOW.md)
- Estándares: [docs/standards/](docs/standards/)
- Roadmap de specs: [docs/specs/ROADMAP.md](docs/specs/ROADMAP.md)
- Decisiones: [docs/decisions/](docs/decisions/)
- Reglas para agentes (Claude Code / Antigravity): [AGENTS.md](AGENTS.md)

```bash
pnpm install
pnpm start:dev
pnpm check   # typecheck + lint + format + tests
```

## Variables de entorno

| Variable | Descripción | Obligatoria | Valor por defecto |
|---|---|---|---|
| `PORT` | Puerto HTTP del servicio | No | `3000` |
| `LOG_LEVEL` | Nivel de log (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) | No | `info` |
| `KEYCLOAK_ISSUER_URL` | URL base del realm emisor de tokens JWT (ej. `http://localhost:8080/realms/telemetry`) | Sí | — |
| `KEYCLOAK_AUDIENCE` | Audiencia esperada en el claim `aud` | No | `traccar-adapter` |
| `TRACCAR_BASE_URL` | URL base de la instancia de Traccar (ej. `http://localhost:8082`) | Sí | — |
| `TRACCAR_API_TOKEN` | Token de API del usuario de servicio en Traccar | Sí | — |
| `TRACCAR_TIMEOUT_MS` | Timeout en milisegundos para llamadas HTTP a Traccar (100–60000) | No | `5000` |
| `WEBHOOK_TOKEN` | Token compartido que Traccar envía como `Authorization: Bearer …` en el reenvío (mín. 16 caracteres, secreto) | Sí | — |
| `WEBHOOK_MAX_BODY_BYTES` | Tamaño máximo del body del webhook en bytes (1024–10485760); lo que exceda va al dead-letter | No | `1048576` |
| `NATS_SERVERS` | Servidores NATS separados por comas (`nats://…` o `tls://…`) | Sí | — |
| `NATS_CREDS_FILE` | Ruta a un archivo `.creds` de NATS | No | — |
| `NATS_PUBLISH_TIMEOUT_MS` | Timeout de espera del PubAck de JetStream (100–30000) | No | `2000` |
| `NATS_EVENTS_MAX_AGE_DAYS` | Retención del stream `TELEMETRY_EVENTS` en días (1–365) | No | `7` |
| `NATS_DEADLETTER_MAX_AGE_DAYS` | Retención del stream `TELEMETRY_DEADLETTER` en días (1–365) | No | `30` |
| `NATS_DUPLICATE_WINDOW_MINUTES` | Ventana de deduplicación por `Nats-Msg-Id` en minutos (1–60) | No | `10` |

## Integración con Traccar

Configuración requerida de Traccar (reenvío, reintentos, permisos) y caída máxima tolerable: [docs/ops/traccar-config.md](docs/ops/traccar-config.md). Traccar local para desarrollo: [dev/traccar/README.md](dev/traccar/README.md).

## Autenticación de servicios (S2S)

Las llamadas REST a endpoints protegidos de este servicio requieren un token Bearer emitido por Keycloak ([ADR-0003](docs/decisions/0003-service-to-service-auth.md)):

- **Denegación por defecto**: Todo endpoint no marcado explícitamente con `@Public()` responde `403 FORBIDDEN` salvo que declare un rol requerido vía `@RequireRole(...)`.
- **Rutas públicas**: `GET /health` (`@Public()`).
- **Roles de cliente en Keycloak** (definidos bajo el client `traccar-adapter` y presentes en `resource_access.traccar-adapter.roles`):
  - `groups:write`: Permite crear groups (`POST /groups`).
  - `devices:write`: Permite registrar, deshabilitar y habilitar devices (`POST /devices`, etc.).
- **Identidad del llamante**: El claim `azp` identifica al servicio autenticado y se registra automáticamente como `actor` en los logs estructurados HTTP.
- **Entorno local**: Instancia Keycloak preconfigurada disponible en la raíz del proyecto (`docker compose up -d` en `telemetry-project`).
