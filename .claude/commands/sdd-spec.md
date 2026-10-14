---
description: SDD fase 1 — redactar spec.md de un feature del roadmap
argument-hint: <NNN-slug>
---

> **Argumento** (`<ARG>`): `$ARGUMENTS`. Si arriba aparece literal `$ARGUMENTS` o vacío, `<ARG>` es el texto que el usuario escribió tras el comando; si no escribió nada, pregúntalo.

Fase **Spec** para `<ARG>`. Lee únicamente:
1. `docs/specs/ROADMAP.md` (fila de `<ARG>`)
2. `docs/specs/_templates/spec.md`
3. En `docs/product/planning.md`, solo las secciones que contengan los IDs de requisitos de esa fila (usa grep por ID; no leas el archivo entero).

Crea `docs/specs/<ARG>/spec.md` desde la plantilla:
- QUÉ y POR QUÉ, nada de CÓMO (sin nombres de clases ni archivos).
- ACs en formato EARS, numerados, cada uno verificable por un test. Incluye casos de error.
- "No incluye" explícito, alineado con "Explicitly out of scope" del planning.
- Lo que no puedas afirmar con lo leído → `## Preguntas abiertas`. No inventes contratos de Traccar.
- `status: draft`. Máximo ~1 página.

Termina mostrando la lista de ACs y preguntas abiertas, y pide aprobación. No avances a la fase de plan.
