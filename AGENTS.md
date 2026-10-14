# traccar-adapter

Único servicio que conoce Traccar. Vocabulario: **Device** y **Group** (nunca vehicle/tenant). Stateless: sin BD propia.
Stack: NestJS 12 (ESM, imports relativos con `.js`), TypeScript strict, Vitest, oxlint, prettier, pnpm.

## Reglas duras (no negociables)

1. **Nunca** exponer una operación que mueva un device entre groups (FR3/NFR5).
2. **Nunca** descartar un payload en silencio: si falla, va a `telemetry.deadletter` (FR10).
3. Dependencias hexagonales: `domain` ← `application` ← `infrastructure`. Lint las hace cumplir.
4. Sin código que no salga de un task aprobado. Sin spec aprobado no hay task.

## Flujo SDD (resumen) → detalle en `docs/sdd/WORKFLOW.md`

`/sdd-spec` → aprobación → `/sdd-plan` → aprobación → `/sdd-tasks` → `/sdd-impl <spec>-<task>` (1 task = 1 sesión = 1 commit). `/sdd-status` para ver el siguiente task.

## Presupuesto de contexto

- En una sesión de implementación lee **solo** el archivo del task y los archivos listados en su sección `Contexto`.
- No leas `docs/product/planning.md` completo; los specs citan los IDs (FRx/NFRx) que necesitas.
- Si te falta contexto, **para** y reporta qué falta; no explores el repo a ciegas.
- Estándares: carga solo el que aplique (`docs/standards/{architecture,coding,testing,git}.md`).

## Comandos de proyecto

- `pnpm check` — typecheck + lint + format:check + test (Definition of Done)
- `pnpm test` / `pnpm test:e2e` / `pnpm lint` / `pnpm format`

## Multi-agente (Claude Code + Antigravity)

- Este archivo (`AGENTS.md`) es la **única** fuente de reglas. `CLAUDE.md` solo lo importa. No dupliques reglas en otro sitio.
- Comandos SDD: fuente en `docs/sdd/commands/` → copias en `.claude/commands/` y `.agents/workflows/`.
- Skills: fuente en `docs/sdd/skills/<nombre>/SKILL.md` → copias en `.claude/skills/` y `.agents/skills/`. Un skill es el *cómo* y **referencia** estándares/ADRs, nunca los copia.
- Las copias se generan con `pnpm sdd:sync`. **Nunca** edites las copias.
- Los artefactos propios del agente (p.ej. *Implementation Plan* / *Task List* de Antigravity, o planes internos de Claude) **no sustituyen** a `docs/specs/**`. El estado oficial vive solo ahí.
- Un task por conversación nueva, en cualquiera de los dos agentes. No trabajes en paralelo sobre el mismo spec desde dos agentes.
