import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('AC-12a: GET /health returns 200, exactly { status: "ok" }, and application/json content-type', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('Content-Type', /application\/json/);

    expect(res.body).toEqual({ status: 'ok' });
  });

  it('AC-12b: controller has no injected dependencies (empty constructor) and no guards', () => {
    expect(HealthController.length).toBe(0);
    const classGuards = Reflect.getMetadata('__guards__', HealthController);
    const checkMethod = Object.getOwnPropertyDescriptor(
      HealthController.prototype,
      'check',
    )?.value as object;
    const methodGuards = Reflect.getMetadata('__guards__', checkMethod);
    expect(classGuards).toBeUndefined();
    expect(methodGuards).toBeUndefined();
  });
});
