---
spec: 005-device-register
---

# 005 — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Add Device domain, retiredUniqueId and device errors (409/404) | 004-T02 | done |
| T02 | Add TraccarDevicePort with structural type test | T01 | todo |
| T03 | Add RegisterDeviceUseCase | T02 | todo |
| T04 | Add TraccarDeviceHttpAdapter | T02, 003-T04 | todo |
| T05 | Add RegisterDevice DTO and DeviceController with audit log | T03, 004-T01, 002-T04 | todo |
| T06 | Wire DeviceModule into AppModule | T04, T05 | todo |
| T07 | Add route allowlist e2e test | T06, 004-T06 | todo |
| T08 | Add device-register e2e suite | T06, 004-T07 | todo |

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T03, T04, T08 |
| AC-2 | T03, T08 |
| AC-3 | T01, T03, T08 |
| AC-4 | T01, T03, T04, T08 |
| AC-5 | T03, T08 |
| AC-6 | T01, T03, T04, T08 |
| AC-7 | T05, T08 |
| AC-8 | T03, T04, T08 |
| AC-9 | T05, T08 |
| AC-10 | T05 |
| AC-11 | T02, T04, T07 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [ ] `pnpm check` y `pnpm test:e2e` en verde
- [ ] Variables de entorno nuevas documentadas (README) y añadidas a `test/support/test-env.ts` (este spec no añade ninguna)
- [ ] ADRs/skills afectados actualizados (`pnpm sdd:sync` si cambió un skill)
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
