---
spec: 004-group-create
status: approved       # draft | approved
---

# 004 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| shared/domain | `src/shared/domain/validation.error.ts` | N | `ValidationError` (`VALIDATION_ERROR`) con `details` |
| shared/infra | `src/shared/infrastructure/http/zod-validation.pipe.ts` | N | Pipe genérico: `schema.safeParse` → `ValidationError(details)` |
| shared/infra | `src/shared/infrastructure/http/http-exception.filter.ts` | M | Emitir `details` cuando el `DomainError` los trae |
| shared/infra | `src/shared/infrastructure/http/error-http-status.ts` | M | `GROUP_NAME_AMBIGUOUS: 409` |
| domain | `src/modules/group/domain/group.ts` | N | Tipo `Group` |
| domain | `src/modules/group/domain/errors.ts` | N | `GroupNameAmbiguousError` |
| application | `src/modules/group/application/ports/traccar-group.port.ts` | N | `TraccarGroupPort` + token |
| application | `src/modules/group/application/use-cases/create-group.use-case.ts` | N | Get-or-create por nombre exacto (AC-1..3, AC-5) |
| infra/outbound | `src/modules/group/infrastructure/outbound/traccar-group.http-adapter.ts` | N | `GET`/`POST /api/groups` vía `TraccarHttpClient` |
| infra/inbound | `src/modules/group/infrastructure/inbound/dto/create-group.dto.ts` | N | Schema zod `.strict()` (AC-4) |
| infra/inbound | `src/modules/group/infrastructure/inbound/group.controller.ts` | N | `POST /groups`, rol, 201/200, log de auditoría (AC-6, AC-7) |
| wiring | `src/modules/group/group.module.ts` | N | DI con `useFactory` + tokens |
| wiring | `src/app.module.ts` | M | Importar `GroupModule` |
| e2e | `test/group-create.e2e-spec.ts` | N | AC-1..8 a nivel de proceso, con Traccar fake |

## Contratos internos
```ts
// shared/domain/validation.error.ts
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  constructor(readonly details: ValidationIssue[]) { super('Validation failed'); }
}
export interface ValidationIssue { path: string; message: string }

// modules/group/domain/group.ts
export interface Group { readonly id: number; readonly name: string }

// modules/group/domain/errors.ts
export class GroupNameAmbiguousError extends DomainError {
  readonly code = 'GROUP_NAME_AMBIGUOUS';
  constructor(readonly name: string, readonly matches: number) { super(...); }
}

// modules/group/application/ports/traccar-group.port.ts
export const TRACCAR_GROUP_PORT = Symbol('TraccarGroupPort');
export interface TraccarGroupPort {
  list(): Promise<Group[]>;                 // GET /api/groups
  create(name: string): Promise<Group>;     // POST /api/groups {name}, sin groupId padre
}

// modules/group/application/use-cases/create-group.use-case.ts
export interface CreateGroupInput { name: string }
export interface CreateGroupOutput { group: Group; created: boolean }
export class CreateGroupUseCase {
  constructor(private readonly traccar: TraccarGroupPort) {}
  execute(input: CreateGroupInput): Promise<CreateGroupOutput>;
  // lanza GroupNameAmbiguousError | UpstreamUnavailableError
}

// modules/group/infrastructure/inbound/dto/create-group.dto.ts
export const createGroupSchema = z.object({
  name: z.string().max(128).refine((s) => s.trim().length > 0),
}).strict();
export type CreateGroupDto = z.infer<typeof createGroupSchema>;
// Respuesta: { groupId: number; name: string }
```

## Flujo
1. Guard global valida JWT + `@RequireRole('groups:write')` → 401/403.
2. `ZodValidationPipe(createGroupSchema)` → 400 `VALIDATION_ERROR` + `details`.
3. Use case: `list()` → filtra `g.name === name` (exacto, sensible a mayúsculas).
   - 0 → `create(name)` → `{created: true}` → controller `201`.
   - 1 → `{created: false}` → `200`.
   - ≥2 → `GroupNameAmbiguousError` → filtro → `409`.
4. Traccar caído/5xx/401 → `UpstreamUnavailableError` (ya lo lanza `TraccarHttpClient`) → `503`.
5. El controller mide `durationMs` y en `finally` loguea `{msg:'group.create', op:'group.create', actor, name, groupId?, result, durationMs}`; `result` = `created|existing|ambiguous|failed`. Formato según `docs/standards/coding.md` › "Auditoría de operaciones".

## Decisiones
- **`name` no se transforma**: `trim` solo valida (AC-4); se guarda y compara tal cual (clave opaca de core-service, ADR-0005 §3). Descartado: normalizar con `trim`, porque cambiaría la clave.
- **El filtrado exacto vive en el use case**, no en el adapter: es la regla de negocio de AC-2/3. Traccar no ofrece filtro por nombre.
- **El log de auditoría va en el controller**, no en el use case: es quien conoce `actor` y el resultado HTTP. Así el use case queda puro, sin `LoggerPort`.
- **201/200 dinámico** con `@Res({ passthrough: true })` + `res.status()`. Descartado: dos rutas o `@HttpCode` fijo.
- `ValidationError` y `ZodValidationPipe` van a `shared/` porque 005 y 006 los reutilizan. Aplican ADR-0002 §3, así que no hace falta un ADR nuevo.

## Riesgos / preguntas abiertas
- Carrera entre dos creaciones concurrentes con el mismo nombre: aceptada en ADR-0005 (consecuencias). El siguiente intento cae en AC-3 (409).
- Un `4xx` de Traccar en `POST /api/groups` (`TraccarRequestError`) no está en el spec: termina en `500 INTERNAL_ERROR` con `result: failed`. ¿Aceptable para el MVP?
- `GET /api/groups` devuelve todos los groups accesibles, sin paginar. Con el volumen esperado del MVP es asumible.
