---
id: 004-T06
status: todo           # todo | doing | blocked | done
depends_on: [004-T04, 004-T05]
covers: []
---

# 004-T06 — Wire GroupModule into AppModule

## Objetivo
La aplicación arranca con `GroupModule` registrado y `POST /groups` resuelto contra el adapter HTTP real.

## Contexto (leer SOLO esto)
- `src/app.module.ts`
- `src/shared/infrastructure/traccar/traccar.module.ts`
- `docs/standards/architecture.md` (sección "Regla de dependencias")

## Contrato
```ts
// src/modules/group/group.module.ts
@Module({
  controllers: [GroupController],
  providers: [
    { provide: TRACCAR_GROUP_PORT, useFactory: (c: TraccarHttpClient) => new TraccarGroupHttpAdapter(c), inject: [TraccarHttpClient] },
    { provide: CreateGroupUseCase, useFactory: (p: TraccarGroupPort) => new CreateGroupUseCase(p), inject: [TRACCAR_GROUP_PORT] },
  ],
})
export class GroupModule {}
// src/app.module.ts → añadir GroupModule a imports
```
`TraccarModule` es `@Global()` y exporta `TraccarHttpClient`, así que no hace falta importarlo en `GroupModule`.

## Archivos a crear/modificar
- [ ] `src/modules/group/group.module.ts` (nuevo) + `group.module.spec.ts`
- [ ] `src/app.module.ts` (modificado)

## Criterios de aceptación
- [ ] `group.module.spec.ts`: un `TestingModule` con `GroupModule` y un `TraccarHttpClient` falso (`useValue`, módulo global de test) resuelve `CreateGroupUseCase` y `GroupController`, y `TRACCAR_GROUP_PORT` es `instanceof TraccarGroupHttpAdapter`.
- [ ] `pnpm test` existente sigue en verde, incluida `test/app.e2e-spec.ts` (`pnpm test:e2e`).

## Fuera de alcance
- Escenarios HTTP completos (T07).

## Verificación
```bash
pnpm vitest run src/modules/group
pnpm check
pnpm test:e2e
```

## Handoff
