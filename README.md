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

## Autenticación de servicios (S2S)

Las llamadas REST a endpoints protegidos de este servicio requieren un token Bearer emitido por Keycloak ([ADR-0003](docs/decisions/0003-service-to-service-auth.md)):

- **Denegación por defecto**: Todo endpoint no marcado explícitamente con `@Public()` responde `403 FORBIDDEN` salvo que declare un rol requerido vía `@RequireRole(...)`.
- **Rutas públicas**: `GET /health` (`@Public()`).
- **Roles de cliente en Keycloak** (definidos bajo el client `traccar-adapter` y presentes en `resource_access.traccar-adapter.roles`):
  - `groups:write`: Permite crear groups (`POST /groups`).
  - `devices:write`: Permite registrar, deshabilitar y habilitar devices (`POST /devices`, etc.).
- **Identidad del llamante**: El claim `azp` identifica al servicio autenticado y se registra automáticamente como `actor` en los logs estructurados HTTP.
- **Entorno local**: Instancia Keycloak preconfigurada disponible en la raíz del proyecto (`docker compose up -d` en `telemetry-project`).
