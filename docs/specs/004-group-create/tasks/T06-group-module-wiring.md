---
id: 004-T06
status: done           # todo | doing | blocked | done
depends_on: [004-T04, 004-T05]
covers: [AC-7]
---

# 004-T06 — Wire GroupModule into AppModule

## Objetivo
La aplicación arranca con `GroupModule` registrado y `POST /groups` resuelto contra el adapter HTTP real.

## Contexto (leer SOLO esto)
- `src/app.module.ts`
- `src/modules/group/infrastructure/inbound/group.controller.ts` (solo el bloque `finally` de auditoría)
- `docs/standards/coding.md` (sección "Auditoría de operaciones")
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
- [ ] `src/modules/group/infrastructure/inbound/group.controller.ts` (modificado: añadir `msg` a la línea de auditoría)
- [ ] `src/modules/group/infrastructure/inbound/group.controller.spec.ts` (ampliar el test de AC-7)

## Criterios de aceptación
- [ ] `group.module.spec.ts`: un `TestingModule` con `GroupModule` y un `TraccarHttpClient` falso (`useValue`, módulo global de test) resuelve `CreateGroupUseCase` y `GroupController`, y `TRACCAR_GROUP_PORT` es `instanceof TraccarGroupHttpAdapter`.
- [ ] **AC-7b** — La línea de auditoría `group.create` incluye `msg: 'group.create'` (igual a `op`), como exigen ADR-0002 §4 y `coding.md` › "Auditoría de operaciones". El test de AC-7 en `group.controller.spec.ts` lo comprueba en los cuatro resultados.
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
- GroupModule implementado y cableado en AppModule con GroupController, TraccarGroupHttpAdapter y CreateGroupUseCase.
- Añadido `msg: 'group.create'` a la línea de auditoría y tests actualizados para AC-7b.
- Todos los checks y e2e en verde. Queda desbloqueado 004-T07 (group-create e2e suite).
