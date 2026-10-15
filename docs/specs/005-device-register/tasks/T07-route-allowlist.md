---
id: 005-T07
status: done           # todo | doing | blocked | done
depends_on: [005-T06, 004-T06]
covers: [AC-11]
---

# 005-T07 — Add route allowlist e2e test

## Objetivo
Un test falla si la aplicación registra cualquier ruta HTTP que no esté en una lista permitida explícita. Es la red de seguridad estructural de FR3/NFR5.

## Contexto (leer SOLO esto)
- `test/app.e2e-spec.ts` (solo cómo se construye la app con `AppModule.register` y el verifier falso)
- `test/support/test-env.ts`
- `src/app.module.ts` (solo `AppModule.register`)

## Contrato
```ts
// test/route-allowlist.e2e-spec.ts
const ALLOWED_ROUTES = [
  'GET /health',
  'GET /health/ready',
  'POST /groups',
  'POST /devices',
].sort();
// Ampliar esta lista es una decisión explícita de cada spec (p.ej. 006, 008).
```
Cómo extraer las rutas: tras `app.init()`, recorre el router de Express (`app.getHttpAdapter().getInstance().router.stack` en Express 5, o `._router.stack` en Express 4). Toma las capas con `route` y genera `"<METHOD> <path>"` por cada método. Ignora middleware y métodos implícitos (`HEAD`/`OPTIONS` que Express añade solo). Si el camino interno de Express resulta frágil, usa la alternativa de inspeccionar `DiscoveryService`/`MetadataScanner` y documéntalo en el Handoff.

## Archivos a crear/modificar
- [x] `test/route-allowlist.e2e-spec.ts` (nuevo)

## Criterios de aceptación
- [x] **AC-11** — Las rutas registradas, ordenadas, son exactamente `ALLOWED_ROUTES`.
- [x] Prueba negativa: el test falla si se añade temporalmente un `@Patch()` a `DeviceController`. Verifícalo en local y no lo commitees; déjalo anotado en el Handoff.
- [x] Ninguna ruta contiene `groupId` como parámetro de path bajo `/devices`.

## Fuera de alcance
- Test de tipos del port (T02).

## Verificación
```bash
pnpm test:e2e
pnpm check
```

## Handoff
- Creado test e2e en `test/route-allowlist.e2e-spec.ts` validando exactamente las 4 rutas autorizadas.
- Filtra wildcards de Express 5 (`{/*splat}`) correspondientes al RequestContextMiddleware.
- Verificada prueba negativa: añadir temporalmente `@Patch(':id')` a `DeviceController` hizo fallar el test con diff exacto.
- Desbloquea T08 (device-register e2e suite).
