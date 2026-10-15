---
id: 015-ci-pipeline
status: approved       # draft | approved | in-progress | done
requirements: []
adrs: []
---

# 015 — Pipeline de integración continua

## Problema
La Definition of Done (`pnpm check`, e2e con NATS real y, desde 014, `pnpm test:image`) solo se verifica a mano en la
máquina de quien implementa. Un PR puede mergearse con tests rotos o dependiendo del entorno local (como el fallo de
red de Docker visto en 014). Hace falta que GitHub lo verifique en cada PR, igual para cualquier persona o agente.

## Alcance
- Incluye: un workflow de GitHub Actions que, en cada PR hacia `main` y en cada push a `main`, ejecuta las tres
  verificaciones; versiones fijadas de Node y pnpm; documentación de cómo hacer obligatoria la verificación.
- **No incluye**:
  - Publicar la imagen en un registro ni desplegar (CD): se definirá con el primer entorno remoto.
  - Configurar la protección de rama en GitHub (es un ajuste del repo que hace su dueño; solo se documenta).
  - Dependabot/Renovate, análisis de seguridad, cobertura publicada o badges externos.

## Comportamiento (criterios de aceptación)
- **AC-1** — CUANDO se abre o actualiza un PR hacia `main`, o se hace push a `main`, el sistema DEBE ejecutar
  `pnpm check`, la suite e2e y la suite de imagen, y marcar el commit en rojo si cualquiera falla.
- **AC-2** — La suite e2e DEBE ejecutarse contra un servidor NATS con JetStream levantado por el propio pipeline.
- **AC-3** — El pipeline DEBE usar la misma versión de Node que la imagen y la versión de pnpm declarada en el repo, e
  instalar dependencias exactamente según el lockfile (falla si no coincide).
- **AC-4** — El pipeline NO DEBE requerir secretos del repositorio: todas las suites usan dobles o infraestructura
  efímera.
- **AC-5** — CUANDO llega un push nuevo a un PR con una ejecución en curso, el sistema DEBE cancelar la ejecución
  anterior.
- **AC-6** — Cada verificación DEBE aparecer como un check con nombre propio en el PR, para poder marcarlas como
  obligatorias.
- **AC-7** — El pipeline NO DEBE tener permisos de escritura sobre el repositorio (`contents: read`).

## Contratos externos
- Archivo de workflow en `.github/workflows/`. Checks: `check`, `e2e`, `image`.
- Archivo de versión de Node en la raíz, compartido por el pipeline y por quien desarrolla.

## Preguntas abiertas
_Ninguna._
