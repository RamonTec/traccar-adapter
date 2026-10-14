---
description: SDD fase 4 — implementar UN micro-task (TDD) y cerrarlo
argument-hint: <NNN>-<Tnn>  (ej. 004-T03)
---

> **Argumento** (`<ARG>`): `$ARGUMENTS`. Si arriba aparece literal `$ARGUMENTS` o vacío, `<ARG>` es el texto que el usuario escribió tras el comando; si no escribió nada, pregúntalo.

Implementa el task `<ARG>`.

1. Localiza el archivo: `docs/specs/<NNN>-*/tasks/<Tnn>-*.md`. Léelo.
2. Verifica que todos sus `depends_on` estén `done` en el `tasks.md` del spec. Si no, para.
3. Lee **solo** los archivos de su sección `Contexto`. No leas spec.md, design.md ni planning.md. Si falta información para cumplir un AC: marca el task `blocked`, escribe en `## Handoff` qué falta, y para.
4. Marca `status: doing` (front-matter y `tasks.md`).
5. TDD con el skill `automated-testing`: por cada AC, escribe el test (`it('AC-n: ...')`), comprueba que falla, implementa lo mínimo, pasa.
6. Toca solo los archivos listados en `Archivos a crear/modificar`. Si necesitas otro, para y avisa.
7. Ejecuta los comandos de `Verificación` y `pnpm check`. Deben quedar en verde.
8. Cierre: `status: done` en ambos sitios, rellena `## Handoff` (≤ 5 líneas). Si es el último task del spec, marca el spec `done`.
9. Propón el commit `feat(<NNN>-<Tnn>): <título>` según `docs/standards/git.md` y pide confirmación antes de commitear.

Reporta: ACs cubiertos, resultado de `pnpm check`, y cualquier desviación.
