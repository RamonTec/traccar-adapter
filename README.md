# traccar-adapter

Adapter (anti-corruption layer) entre la plataforma de telemetría y Traccar. Único servicio que conoce Traccar; habla solo de **Device** y **Group**.

- Producto: [docs/product/planning.md](docs/product/planning.md)
- Flujo de trabajo SDD: [docs/sdd/WORKFLOW.md](docs/sdd/WORKFLOW.md)
- Estándares: [docs/standards/](docs/standards/)
- Roadmap de specs: [docs/specs/ROADMAP.md](docs/specs/ROADMAP.md)
- Decisiones: [docs/decisions/](docs/decisions/)
- Reglas para agentes (Claude Code / Antigravity): [AGENTS.md](AGENTS.md)

```bash
pnpm install
pnpm start:dev
pnpm check   # typecheck + lint + format + tests
```
