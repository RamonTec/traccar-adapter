---
id: 004-T05
status: done           # todo | doing | blocked | done
depends_on: [004-T01, 004-T03, 002-T04]
covers: [AC-4, AC-6, AC-7, AC-8]
---

# 004-T05 — Add CreateGroup DTO and GroupController with audit log

## Objetivo
`POST /groups` valida el body, exige `groups:write`, responde 201 si crea y 200 si ya existía, y deja una línea de auditoría `group.create` por petición.

## Contexto (leer SOLO esto)
- `src/modules/group/application/use-cases/create-group.use-case.ts` (solo firmas)
- `src/shared/infrastructure/http/zod-validation.pipe.ts`
- `src/shared/infrastructure/auth/auth.decorators.ts`
- `test/support/log-capture.ts`
- skill `automated-testing` (`recipes.md` §4)

## Contrato
```ts
// src/modules/group/infrastructure/inbound/dto/create-group.dto.ts
export const createGroupSchema = z.object({
  name: z.string().max(128).refine((s) => s.trim().length > 0, { message: 'name must not be blank' }),
}).strict();
export type CreateGroupDto = z.infer<typeof createGroupSchema>;

// src/modules/group/infrastructure/inbound/group.controller.ts
@Controller('groups')
export class GroupController {
  private readonly logger = new Logger(GroupController.name);
  constructor(private readonly createGroup: CreateGroupUseCase) {}   // token = la clase
  @Post()
  @RequireRole('groups:write')
  create(
    @Body(new ZodValidationPipe(createGroupSchema)) dto: CreateGroupDto,
    @Actor() actor: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ groupId: number; name: string }>;
}
```
Reglas:
- `created` → `res.status(201)`; existente → `res.status(200)`. Body `{ groupId: group.id, name: group.name }`.
- Auditoría en `try/finally`, una sola línea por petición válida, a nivel `info` si hay éxito y `warn` si falla:
  `{ op: 'group.create', actor, name, groupId?, result, durationMs }`
  con `result` = `created | existing | ambiguous` (si es `GroupNameAmbiguousError`) `| failed` (cualquier otro error, que se relanza sin tocarlo).
- El controller expone **solo** `POST /groups`: no hay GET, PUT, PATCH ni DELETE.

## Archivos a crear/modificar
- [x] `src/modules/group/infrastructure/inbound/dto/create-group.dto.ts` (nuevo) + `.spec.ts`
- [x] `src/modules/group/infrastructure/inbound/group.controller.ts` (nuevo)
- [x] `src/modules/group/infrastructure/inbound/group.controller.spec.ts` (nuevo: `Test.createTestingModule` con un `CreateGroupUseCase` falso vía `useValue`, `HttpExceptionFilter` como `APP_FILTER` y supertest)

## Criterios de aceptación
- [x] **AC-4** — El schema rechaza `{}`, `{name:1}`, `{name:'   '}`, `{name:'a'.repeat(129)}` y `{name:'a', extra:true}`; acepta `'a'.repeat(128)` y `' acme '` sin transformarlo. Vía HTTP: 400 `VALIDATION_ERROR` con `details` no vacío, sin llamar al use case.
- [x] **AC-1/2 (HTTP)** — Use case falso `created:true` → 201 `{groupId, name}`; `created:false` → 200.
- [x] **AC-6** — Metadatos de la ruta: `Reflector` devuelve `'groups:write'` para `REQUIRED_ROLE_KEY` en el handler `create`.
- [x] **AC-7** — Con log-capture: tras cada uno de `created`, `existing`, `GroupNameAmbiguousError` (→ 409) y `UpstreamUnavailableError` (→ 503) hay exactamente una línea con `op:'group.create'`, `actor`, `name`, `result` correcto y `durationMs` numérico; `groupId` presente solo si hay group.
- [x] **AC-8** — Los métodos de `GroupController.prototype` decorados con ruta son solo `create` (POST). Se comprueba con `Reflect.getMetadata('method', ...)` sobre cada método.

## Fuera de alcance
- Registro en `GroupModule`/`AppModule` (T06). Guard JWT real (ya existe; e2e en T07).

## Verificación
```bash
pnpm vitest run src/modules/group/infrastructure/inbound
pnpm check
```

## Handoff
- `GroupController` inyecta `CreateGroupUseCase` por clase; T06 debe proveer ese token (`useFactory` con `TRACCAR_GROUP_PORT`).
- Auditoría con el `Logger` de Nest: `log` → `level: 'info'`, `warn` → `level: 'warn'` (labels, no números). `groupId` solo aparece si hay group; `durationMs` se redondea a ms.
- En el spec, el actor lo pone un middleware de test (`req.actor = 'svc-test'`) en lugar del guard JWT; el actor real se prueba en T07.
