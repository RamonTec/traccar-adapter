---
spec: 016-published-contracts
status: approved       # draft | approved
---

# 016 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| docs | `docs/contracts/openapi.yaml` | N | OpenAPI 3.1: comandos + health, seguridad, errores, `x-idempotent` / `x-retryable` |
| docs | `docs/contracts/asyncapi.yaml` | N | AsyncAPI 3.0: canales, mensajes, headers, bindings de JetStream, garantías |
| docs | `docs/contracts/README.md` | N | Guía de integración (api-core y consumidores de eventos) y política de versiones |
| docs | `README.md` | M | Enlace a `docs/contracts/` |
| test | `test/support/contracts.ts` | N | Carga los YAML; valida un valor contra un esquema (`ajv` 2020-12 + formatos) |
| test | `test/contracts/documents.spec.ts` | N | AC-4: ambos documentos válidos según su especificación |
| test | `test/contracts/routes.spec.ts` | N | AC-5: rutas de los controllers (vía metadata de Nest) = rutas del OpenAPI |
| test | `test/support/http-contract.ts` | N | AC-6: middleware que registra respuestas y las valida contra el OpenAPI |
| test | `test/{group-create,device-register,device-status,app}.e2e-spec.ts` | M | Instalan el registro y comprueban el contrato en `afterEach` |
| test | `test/{ingest-to-jetstream,ingest-to-deadletter,outbox}.e2e-spec.ts` | M | AC-7: cada mensaje leído del stream se valida contra el AsyncAPI |
| raíz | `package.json` | M | devDependencies: `yaml`, `ajv`, `ajv-formats`, `@readme/openapi-parser`, `@asyncapi/parser` |

## Contratos internos
```ts
// test/support/contracts.ts
export const OPENAPI_PATH = 'docs/contracts/openapi.yaml';
export const ASYNCAPI_PATH = 'docs/contracts/asyncapi.yaml';
export function loadDocument(path: string): Record<string, unknown>;          // YAML → objeto (cacheado)
export interface ContractViolation { readonly where: string; readonly errors: string[] }
/** Valida `value` contra `#/components/schemas/...` (o un JSON pointer) del documento; resuelve $ref internos. */
export function validateAgainst(docPath: string, pointer: string, value: unknown): ContractViolation | null;

// test/support/http-contract.ts
export interface RecordedResponse { method: string; path: string; status: number; body: unknown }
/** Middleware Express: registra método, ruta real, status y body JSON de cada respuesta. */
export function recordResponses(app: INestApplication): { take(): RecordedResponse[] };
/** Busca la operación del OpenAPI que casa con método+ruta (plantillas `{deviceId}`) y valida body por status.
 *  Rutas fuera del alcance (webhooks) se ignoran. Status no documentado → violación. */
export function checkHttpContract(responses: RecordedResponse[]): ContractViolation[];

// AC-7 (en las suites de ingesta)
export function expectMessageContract(subject: string, payload: unknown): void;   // canal por subject → schema del mensaje
```

**OpenAPI (resumen)**
| Operación | Rol | Éxito | Errores documentados |
|-----------|-----|-------|----------------------|
| `POST /groups` `{name}` | `groups:write` | 201 creado · 200 existente `{groupId, name}` | 400 `VALIDATION_ERROR`, 401, 403, 409 `GROUP_NAME_AMBIGUOUS`, 503 `UPSTREAM_UNAVAILABLE`, 500 |
| `POST /devices` `{uniqueId, name, groupId}` | `devices:write` | 201 creado/retirado-y-creado · 200 existente `{deviceId, uniqueId, groupId}` | 400, 401, 403, 404 `GROUP_NOT_FOUND`, 409 `DEVICE_ALREADY_REGISTERED`, 503, 500 |
| `POST /devices/{deviceId}/disable` · `/enable` (body vacío) | `devices:write` | 200 `{deviceId, disabled}` | 400, 401, 403, 404 `DEVICE_NOT_FOUND`, 409 `DEVICE_RETIRED`, 503, 500 |
| `GET /health` | público | 200 `{status:"ok"}` | — |
| `GET /health/ready` | público | 200 / 503 `{status, checks, outbox}` | — |

- Seguridad: `securitySchemes.keycloak` (`http` bearer JWT) con `x-audience: traccar-adapter`; rol por operación
  en `x-required-role` y en la descripción.
- `ErrorBody` (ADR-0002): `{code, message, correlationId, details?}`; `code` como `enum` por respuesta.
- Extensiones por operación: `x-idempotent: true`; por respuesta: `x-retryable: true|false` (503 y 500 → `true`,
  resto → `false`).

**AsyncAPI (resumen)**: servidor `nats` (protocolo `nats`); canales = subjects de ADR-0004; mensajes
`PositionReported`, `DeviceEvent`, `DeadLetter` con `headers` (`Nats-Msg-Id`, `x-correlation-id`) y `payload` en
JSON Schema; `x-jetstream` por canal (stream, `max_age`, `duplicate_window`); garantías y versionado en
`info.description`.

## Flujo
1. `pnpm check` → `documents.spec.ts` (AC-4) y `routes.spec.ts` (AC-5): sin NATS ni Traccar.
   - Rutas: `Test.createTestingModule({ imports: [AppModule.register(testConfig()), DiscoveryModule] }).compile()`
     → `DiscoveryService.getControllers()` + metadata `path`/`method` → conjunto `"POST /devices/{deviceId}/disable"`
     (`:param` → `{param}`), excluyendo `/webhooks/*` → igual al conjunto de `paths` del OpenAPI.
2. `pnpm test:e2e` → las suites HTTP registran respuestas; `afterEach` → `checkHttpContract` debe devolver `[]` (AC-6).
   Las de ingesta validan cada mensaje que ya leen del stream (AC-7).

## Decisiones
- **YAML escrito a mano + tests**, no generado del código: permite descripciones para consumidores (reintentos,
  flujos) y los tests impiden que se desalinee. Descartado `@nestjs/swagger` (decoradores en todos los DTO, no cubre
  AsyncAPI) y generar desde zod (solo cubre requests).
- **Validación con las suites existentes** (registro de respuestas) en vez de una suite de contrato aparte: reutiliza
  todos los casos de error que ya se prueban y evita duplicarlos.
- **Validadores oficiales de documento** (`@readme/openapi-parser`, `@asyncapi/parser`) solo como devDependencies;
  `ajv` para validar valores contra los esquemas (OpenAPI 3.1 y AsyncAPI usan JSON Schema).
- **Versión inicial `1.0.0`** en ambos documentos; mayor = cambio incompatible (política en la guía).

## Riesgos / preguntas abiertas
- `@asyncapi/parser` es pesado (solo dev); si da problemas con ESM/Node 24, alternativa: validar contra el JSON
  Schema oficial de AsyncAPI 3.0 vendorizado.
- AC-6 valida lo que las suites ejercitan; un status documentado que ninguna suite produce no se detecta (se revisa en
  el PR).
