import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { testConfig } from '../../../../test/support/test-env.js';
import { configureHttp } from './configure-http.js';
import type { RawWebhookBody } from './raw-body.middleware.js';

@Controller()
class EchoController {
  @Post('webhooks/traccar/echo')
  @HttpCode(200)
  echo(@Req() req: { rawWebhookBody: RawWebhookBody }) {
    return {
      base64: req.rawWebhookBody.body.toString('base64'),
      length: req.rawWebhookBody.body.length,
      oversized: req.rawWebhookBody.oversized,
    };
  }

  @Post('json-echo')
  @HttpCode(200)
  jsonEcho(@Body() body: unknown) {
    return { body };
  }
}

describe('rawBodyMiddleware (integration)', () => {
  let app: NestExpressApplication;

  async function start(maxBodyBytes: number): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      controllers: [EchoController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureHttp(app, testConfig({ webhook: { maxBodyBytes } }));
    await app.init();
  }

  afterEach(async () => {
    if (app) await app.close();
  });

  it('AC-3: invalid JSON reaches the webhook route byte-for-byte', async () => {
    await start(1024);
    const raw = Buffer.from('{"a":', 'utf8');

    const res = await request(app.getHttpServer())
      .post('/webhooks/traccar/echo')
      .set('content-type', 'application/json')
      .send(raw.toString('utf8'))
      .expect(200);

    expect(Buffer.from(res.body.base64, 'base64')).toEqual(raw);
    expect(res.body.oversized).toBe(false);
  });

  it('AC-5: body over maxBodyBytes → oversized, keeps only maxBodyBytes', async () => {
    await start(1024);

    const res = await request(app.getHttpServer())
      .post('/webhooks/traccar/echo')
      .set('content-type', 'application/json')
      .send('a'.repeat(5000))
      .expect(200);

    expect(res.body).toMatchObject({ oversized: true, length: 1024 });
  });

  it('body exactly at the limit is not oversized', async () => {
    await start(1024);

    const res = await request(app.getHttpServer())
      .post('/webhooks/traccar/echo')
      .set('content-type', 'application/json')
      .send('a'.repeat(1024))
      .expect(200);

    expect(res.body).toMatchObject({ oversized: false, length: 1024 });
  });

  it('routes outside the prefix still get JSON-parsed bodies', async () => {
    await start(1024);

    const res = await request(app.getHttpServer())
      .post('/json-echo')
      .send({ a: 1 })
      .expect(200);

    expect(res.body).toEqual({ body: { a: 1 } });
  });
});
