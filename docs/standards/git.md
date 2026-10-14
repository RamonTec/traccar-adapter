# Estándar: Git

- Rama por spec: `feat/NNN-slug` desde `main`.
- **1 task = 1 commit**, Conventional Commits con el ID del task como scope:
  - `feat(004-T03): add RegisterDeviceUseCase`
  - `test(004-T03): ...`, `refactor(...)`, `fix(...)`, `docs(sdd): ...` para artefactos SDD.
- El commit incluye el código, los tests y la actualización de estado del task (`tasks.md` + front-matter).
- PR por spec al terminar todos sus tasks; descripción = lista de tasks + matriz AC del `tasks.md`.
- No se commitea con `pnpm check` en rojo.
