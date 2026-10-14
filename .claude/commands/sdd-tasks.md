---
description: SDD fase 3 — descomponer un diseño aprobado en micro-tasks autosuficientes
argument-hint: <NNN-slug>
---

> **Argumento** (`<ARG>`): `$ARGUMENTS`. Si arriba aparece literal `$ARGUMENTS` o vacío, `<ARG>` es el texto que el usuario escribió tras el comando; si no escribió nada, pregúntalo.

Fase **Tasks** para `docs/specs/<ARG>/`.

Precondición: `design.md` aprobado. Lee únicamente `spec.md`, `design.md`, `docs/specs/_templates/{tasks,task}.md` y la sección "Micro-tasks" de `docs/sdd/WORKFLOW.md`.

Genera:
- `docs/specs/<ARG>/tasks.md` — índice + matriz AC → tasks (todos los AC cubiertos).
- `docs/specs/<ARG>/tasks/Tnn-<slug>.md` — uno por task.

Cada task DEBE cumplir los límites de micro-task (≤ 3 archivos de producción, ≤ ~150 líneas, ≤ 5 archivos de contexto) y ser **autosuficiente**: copia inline las firmas del design que necesita; su sección `Contexto` lista rutas exactas y nada genérico. El implementador no leerá spec ni design.

Orden: domain → port → use case (con fakes) → adapter outbound → adapter inbound → wiring → e2e.

Muestra el índice y pide revisión. No implementes.
