---
id: 014-container-image
status: approved       # draft | approved | in-progress | done
requirements: [NFR2]
adrs: [0001, 0007]
---

# 014 — Imagen de contenedor

## Problema
El servicio solo se puede ejecutar desde el código fuente (`pnpm start`). Para levantarlo junto al resto de la
plataforma (Traccar, NATS, Keycloak) y, más adelante, en otros entornos, necesita una imagen de contenedor
reproducible. Además, el outbox de ADR-0007 solo protege los mensajes pendientes si el contenedor se detiene de forma
ordenada y su archivo vive en un volumen persistente.

## Alcance
- Incluye: construir la imagen desde el repo, su contenido, el usuario de ejecución, el healthcheck, el apagado
  ordenado y el directorio de datos del outbox preparado para montar un volumen.
- **No incluye**:
  - Publicar la imagen en un registro ni el pipeline de CI (spec 015).
  - El compose de la plataforma, el script de entornos ni la config de Traccar/Keycloak/NATS (repo `telemetry-infra`).
  - Manifiestos de Kubernetes, imágenes multi-arquitectura ni TLS.
  - Configuración específica de sbx/prod: la imagen es la misma para todos los entornos.

## Comportamiento (criterios de aceptación)
- **AC-1** — CUANDO se construye la imagen desde el repo con el lockfile actual, la construcción DEBE ser reproducible:
  versión de Node fijada y dependencias instaladas exactamente según el lockfile (falla si no coincide).
- **AC-2** — CUANDO el contenedor arranca con una configuración válida, el servicio DEBE escuchar en `PORT` y
  `GET /health` DEBE responder `200`.
- **AC-3** — SI falta una variable obligatoria o tiene un valor inválido, ENTONCES el contenedor DEBE terminar con
  código distinto de 0 y una línea de log que nombre la variable.
- **AC-4** — El proceso DEBE ejecutarse con un usuario sin privilegios (no root).
- **AC-5** — La imagen DEBE contener solo lo necesario para ejecutar: código compilado y dependencias de producción. NO
  DEBE contener código fuente TypeScript, tests, fixtures, documentación, `.git` ni archivos `.env*`.
- **AC-6** — La imagen NO DEBE incluir valores propios de un entorno (URLs, tokens, secretos): toda la configuración
  entra por variables de entorno (y archivos montados, p.ej. credenciales de NATS).
- **AC-7** — La imagen DEBE declarar un healthcheck basado en `GET /health`.
- **AC-8** — CUANDO el contenedor recibe `SIGTERM`, el servicio DEBE dejar de aceptar peticiones, cerrar NATS y el
  outbox, y terminar con código `0` en menos de 10 s.
- **AC-9** — El outbox DEBE escribir por defecto en un directorio de datos declarado en la imagen, escribible por el
  usuario de ejecución. CUANDO ese directorio está montado como volumen y el contenedor se recrea con mensajes
  pendientes, el nuevo contenedor DEBE drenarlos al volver NATS (ADR-0007, AC-8 de 013).

## Contratos externos
- Imagen OCI. Puerto expuesto: `PORT` (por defecto `3000`). Volumen: el directorio de datos del outbox.
- Variables de entorno: las mismas documentadas en el README; ninguna nueva salvo, si hace falta, el valor por defecto
  de `OUTBOX_PATH` dentro de la imagen.
- Señales: `SIGTERM` para el apagado ordenado.

## Preguntas abiertas
_Ninguna._
