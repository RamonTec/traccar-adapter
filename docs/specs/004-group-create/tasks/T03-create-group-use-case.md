---
id: 004-T03
status: done           # todo | doing | blocked | done
depends_on: [004-T02]
covers: [AC-1, AC-2, AC-3, AC-5]
---

# 004-T03 — Add TraccarGroupPort and CreateGroupUseCase

## Objetivo
`CreateGroupUseCase` obtiene o crea un group por nombre exacto: crea si no hay ninguno, devuelve el existente si hay uno y lanza un error si hay varios.

## Contexto (leer SOLO esto)
- `src/modules/group/domain/group.ts`
- `src/modules/group/domain/errors.ts`
- `src/shared/domain/upstream-unavailable.error.ts`
- skill `automated-testing` (`recipes.md` §2 y §3)

## Contrato
```ts
// src/modules/group/application/ports/traccar-group.port.ts
export const TRACCAR_GROUP_PORT = Symbol('TraccarGroupPort');
export interface TraccarGroupPort {
  list(): Promise<Group[]>;                 // todos los groups accesibles
  create(name: string): Promise<Group>;     // sin group padre
}

// src/modules/group/application/use-cases/create-group.use-case.ts
export interface CreateGroupInput { name: string }
export interface CreateGroupOutput { group: Group; created: boolean }
export class CreateGroupUseCase {
  constructor(private readonly traccar: TraccarGroupPort) {}
  execute(input: CreateGroupInput): Promise<CreateGroupOutput>;
}
```
Reglas:
- Filtra `list()` con `g.name === input.name`: comparación exacta y sensible a mayúsculas, **sin trim**.
- 0 coincidencias → `create(input.name)` → `{ group, created: true }`.
- 1 coincidencia → `{ group, created: false }`, sin llamar a `create`.
- ≥ 2 coincidencias → `GroupNameAmbiguousError(name, n)`, sin llamar a `create`.
- Errores del port (p.ej. `UpstreamUnavailableError`) se propagan sin envolver.

Clase TS plana, sin decoradores ni imports de `@nestjs/*`, que el lint prohíbe en `application`.

## Archivos a crear/modificar
- [x] `src/modules/group/application/ports/traccar-group.port.ts` (nuevo)
- [x] `src/modules/group/application/use-cases/create-group.use-case.ts` (nuevo) + `.spec.ts` (con `FakeTraccarGroupPort` en memoria dentro del spec, que registre llamadas a `create`)

## Criterios de aceptación
- [x] **AC-1** — Fake vacío → `created: true`, `create` llamado una vez con el nombre tal cual (p.ej. `' acme '` no se recorta).
- [x] **AC-2** — Fake con `{id:7,name:'acme'}` → `{group:{id:7,...}, created:false}` y `create` no se llama. Con `'ACME'` en el fake y `'acme'` de entrada → se crea uno nuevo.
- [x] **AC-3** — Fake con dos `'acme'` → `GroupNameAmbiguousError` con `matches: 2`, y `create` no se llama.
- [x] **AC-5** — Si `list()` rechaza con `UpstreamUnavailableError`, `execute` rechaza con ese mismo error. Un segundo `execute` tras recuperarse con el group ya creado → `created:false`.

## Fuera de alcance
- Adapter HTTP (T04), controller y logs (T05).

## Verificación
```bash
pnpm vitest run src/modules/group/application
pnpm check
```

## Handoff
- `TRACCAR_GROUP_PORT` y `TraccarGroupPort` en `application/ports/traccar-group.port.ts`; el adapter de T04 debe implementarlo.
- `CreateGroupUseCase` es una clase plana: T06 debe registrarla con `useFactory` e `inject: [TRACCAR_GROUP_PORT]`.
- El fake está dentro del spec, no en `__fakes__/`. Si T05 lo necesita, habrá que extraerlo.
