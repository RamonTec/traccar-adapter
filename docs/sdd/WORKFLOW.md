# Flujo SDD (Spec-Driven Development)

Objetivo: que cada sesión del agente trabaje con **contexto mínimo y autosuficiente**, para reducir tokens y alucinaciones.
Principio: *el conocimiento se destila hacia abajo*. Cada fase produce un artefacto más pequeño y concreto que el anterior; la fase de implementación nunca necesita leer las fases superiores.

```
planning.md (producto, grande)          ← fuente, se cita por ID, no se carga
  └─ specs/NNN-x/spec.md     QUÉ y POR QUÉ      (≤ 1 página)
       └─ design.md          CÓMO (contratos)   (≤ 1 página)
            └─ tasks/Tnn.md  UN PASO atómico    (≤ 60 líneas, autosuficiente)
```

## Fases y gates

| # | Fase | Comando | Entrada (lo único que se lee) | Salida | Gate |
|---|------|---------|------------------------------|--------|------|
| 1 | Spec | `/sdd-spec <NNN-slug>` | `ROADMAP.md` + secciones citadas de `planning.md` | `spec.md` (status: draft) | Humano aprueba → `status: approved` |
| 2 | Plan | `/sdd-plan <NNN>` | `spec.md` + `standards/architecture.md` + archivos existentes a tocar | `design.md` | Humano aprueba |
| 3 | Tasks | `/sdd-tasks <NNN>` | `spec.md` + `design.md` | `tasks.md` (índice) + `tasks/Tnn-*.md` | Humano revisa el índice |
| 4 | Impl | `/sdd-impl <NNN>-<Tnn>` | **solo** `tasks/Tnn-*.md` + su lista `Contexto` | código + tests + commit | `pnpm check` verde |
| 5 | Cierre | (en `/sdd-impl`) | — | status `done` + nota de handoff | Todos los tasks `done` → spec `status: done` |

Reglas de las fases:
- Una fase **no** empieza si la anterior no pasó su gate.
- Si en la fase N aparece algo que contradice la fase N-1: **parar**, anotar en `## Preguntas abiertas` del artefacto superior y pedir decisión. No improvisar.
- `/clear` (o conversación nueva) entre tasks. El estado vive en archivos, no en la conversación.
- Funciona igual en Claude Code (`.claude/commands/`) y Antigravity (`.agents/workflows/`): ambos se generan desde `docs/sdd/commands/` con `pnpm sdd:sync`. Igual los skills: `docs/sdd/skills/` → `.claude/skills/` y `.agents/skills/`.

## Micro-tasks: definición

Un task es válido solo si cumple **todo**:

| Criterio | Límite |
|----------|--------|
| Objetivo | una sola frase, un solo comportamiento observable |
| Archivos de producción tocados | ≤ 3 (más sus `*.spec.ts`) |
| Diff estimado | ≤ ~150 líneas |
| Contexto a leer | ≤ 5 archivos, listados explícitamente con ruta |
| Criterios de aceptación | verificables por test o comando, numerados (`AC-n`) |
| Dependencias | IDs de tasks previos que deben estar `done` |
| Autosuficiencia | incluye inline las firmas/contratos que necesita (no "ver design.md") |

Si un task no cabe en esos límites, se parte. Orden típico dentro de un spec:
`domain → port (interfaz) → use case (con fakes) → adapter outbound → adapter inbound (controller/DTO) → wiring de módulo → e2e`.

## Estados

- Spec: `draft | approved | in-progress | done`
- Task: `todo | doing | blocked | done` (en `tasks.md` y en el front-matter del task)

## Trazabilidad

`FRx/NFRx` (planning) → `AC-n` (spec) → `Tnn` (task) → commit `feat(NNN-Tnn): ...`.
Cada AC del spec debe estar cubierto por al menos un task; `tasks.md` tiene la matriz.

## Decisiones

Las decisiones de arquitectura transversales van como ADR en `docs/decisions/` (plantilla `0000-template.md`). Los specs las referencian por número, no las copian.
