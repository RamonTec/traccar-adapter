---
description: SDD — estado de specs y siguiente task disponible
---

Sin abrir contenido de specs ni código, ejecuta:

```bash
grep -H '^status:' docs/specs/*/spec.md 2>/dev/null; grep -H '| T[0-9]' docs/specs/*/tasks.md 2>/dev/null
```

Resume en una tabla: spec, estado, tasks done/total, y el **siguiente task desbloqueado** (estado `todo` con dependencias `done`). Señala tasks `blocked`. Nada más.
