---
description: SDD fase 2 — diseño técnico (design.md) de un spec aprobado
argument-hint: <NNN-slug>
---

> **Argumento** (`<ARG>`): `$ARGUMENTS`. Si arriba aparece literal `$ARGUMENTS` o vacío, `<ARG>` es el texto que el usuario escribió tras el comando; si no escribió nada, pregúntalo.

Fase **Plan** para `docs/specs/<ARG>/`.

Precondición: `spec.md` tiene `status: approved` y sin preguntas abiertas bloqueantes. Si no, para y dilo.

Lee únicamente:
1. `docs/specs/<ARG>/spec.md`
2. `docs/standards/architecture.md`
3. `docs/specs/_templates/design.md`
4. Los archivos existentes que el diseño vaya a modificar (lista primero con `ls`/`grep`, abre solo los necesarios).

Crea `docs/specs/<ARG>/design.md`:
- Tabla de componentes con **rutas exactas** según el layout del estándar.
- Firmas TypeScript exactas de ports, use cases (input/output) y errores — los tasks copiarán de aquí.
- Cada AC del spec debe mapear a algún componente.
- Decisiones transversales → propón un ADR en `docs/decisions/` en vez de enterrarlas aquí.
- Máximo ~1 página.

Pide aprobación. No generes tasks todavía.
