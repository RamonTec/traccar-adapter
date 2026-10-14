---
spec: 001-foundation
---

# 001 — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Add DomainError and error code ↔ HTTP status table | — | done |
| T02 | Add env config loading and validation with zod | — | done |
| T03 | Add correlation ID resolver | — | todo |
| T04 | Add structured logging module (nestjs-pino) | T02, T03 | todo |
| T05 | Add global HTTP exception filter | T01, T04 | todo |
| T06 | Add health controller | — | todo |
| T07 | Wire AppModule and bootstrap, remove starter boilerplate | T02, T04, T05, T06 | todo |
| T08 | Add foundation e2e suite | T07 | todo |

Paralelizables (sin dependencias entre sí): T01, T02, T03, T06.

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T02, T07, T08 |
| AC-2 | T02, T07, T08 |
| AC-3 | T02 |
| AC-4 | T04 |
| AC-5 | T03, T04, T08 |
| AC-6 | T03, T04 |
| AC-7 | T04 |
| AC-8 | T04 |
| AC-9 | T01, T05 |
| AC-10 | T05 |
| AC-11 | T01, T05, T08 |
| AC-12 | T06, T07, T08 |
| AC-13 | T07, T08 |
| AC-14 | T07, T08 |
| AC-15 | T04 |
