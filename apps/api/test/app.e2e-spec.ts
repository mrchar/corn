import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { stringifyJson } from '../src/common/json';
import { PrismaService } from '../src/prisma/prisma.service';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEMPLATE_DEFS = [
  {
    code: 'fund', name: '经费', description: '资金', projectionSubject: '', unit: '元',
    numericScale: 2, divisible: true, allowNegative: false,
    attrSchema: [{ key: 'project', label: '项目', valueType: 'text' }],
    sourceKinds: ['manual', 'event'], sinkKinds: ['manual', 'event'], recommendedTagKeys: [],
  },
  {
    code: 'human-resource', name: '人力资源', description: '人力', projectionSubject: 'member', unit: '人天',
    numericScale: 1, divisible: true, allowNegative: false,
    attrSchema: [{ key: 'grade', label: '职级', valueType: 'text' }],
    sourceKinds: ['manual', 'builtin'], sinkKinds: ['manual'], recommendedTagKeys: [],
  },
];

describe('资源维护端到端流程', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let spaceId: string;
  let domainId: string;

  beforeAll(async () => {
    const testDb = join(__dirname, '..', 'prisma', 'test.db');
    process.env.DATABASE_URL = `file:${testDb}`;
    // 推送 schema 到测试库
    execSync('prisma db push --skip-generate', {
      cwd: join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: `file:${testDb}` },
      stdio: 'pipe',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();

    prisma = app.get(PrismaService);
    // 清空并写入模板
    await prisma.ledgerEntry.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.resourceType.deleteMany();
    await prisma.spaceTemplateSetting.deleteMany();
    await prisma.domain.deleteMany();
    await prisma.space.deleteMany();
    await prisma.builtinTemplate.deleteMany();
    await prisma.builtinTemplate.createMany({
      data: TEMPLATE_DEFS.map((t) => ({
        id: `bt_${t.code}`,
        code: t.code,
        name: t.name,
        description: t.description,
        projectionSubject: t.projectionSubject,
        unit: t.unit,
        numericScale: t.numericScale,
        divisible: t.divisible,
        allowNegative: t.allowNegative,
        attrSchema: stringifyJson(t.attrSchema),
        sourceKinds: stringifyJson(t.sourceKinds),
        sinkKinds: stringifyJson(t.sinkKinds),
        recommendedTagKeys: stringifyJson(t.recommendedTagKeys),
      })),
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('创建空间与领域', async () => {
    const spaceRes = await request(app.getHttpServer())
      .post('/spaces')
      .send({ code: 'acme', name: 'Acme 公司' })
      .expect(201);
    spaceId = spaceRes.body.data.id;
    expect(spaceId).toBeTruthy();

    const domainRes = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/domains`)
      .send({ code: 'ops', name: '运维领域' })
      .expect(201);
    domainId = domainRes.body.data.id;
  });

  it('列出内建模板并启用经费模板', async () => {
    const list = await request(app.getHttpServer())
      .get(`/spaces/${spaceId}/builtin-templates`)
      .expect(200);
    const fundTemplate = list.body.list.find((t: { code: string }) => t.code === 'fund');
    expect(fundTemplate).toBeTruthy();
    expect(fundTemplate.enabled).toBe(false);

    await request(app.getHttpServer())
      .patch(`/spaces/${spaceId}/builtin-templates/${fundTemplate.id}`)
      .send({ enabled: true })
      .expect(200);
  });

  it('据模板继承生成经费资源类型', async () => {
    const fundTemplate = (
      await request(app.getHttpServer()).get(`/spaces/${spaceId}/builtin-templates`)
    ).body.list.find((t: { code: string }) => t.code === 'fund');

    const derive = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/builtin-templates/${fundTemplate.id}/derive`)
      .send({ domainId, mode: 'inherit' })
      .expect(201);
    expect(derive.body.data.code).toBe('fund');
    expect(derive.body.data.origin).toBe('builtin-inherited');
  });

  it('创建经费资源实例', async () => {
    const res = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/fund`)
      .send({ domainId, name: '2026 运维经费', project: '基础设施' })
      .expect(201);
    expect(res.body.data.name).toBe('2026 运维经费');
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.available).toBe(0);
  });

  it('注入经费 50000 元', async () => {
    const resource = (await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund`)).body.list[0];
    const res = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/creations`)
      .send({ resourceId: resource.id, amount: 50000, sourceKind: 'manual', reason: '拨款到账' })
      .expect(201);
    expect(res.body.data.kind).toBe('creation');

    const detail = await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund/${resource.id}`);
    expect(detail.body.data.total).toBe(50000);
    expect(detail.body.data.available).toBe(50000);
  });

  it('占用 8000 元，可用量减少', async () => {
    const resource = (await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund`)).body.list[0];
    const res = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/reservations`)
      .send({ resourceId: resource.id, amount: 8000, purpose: '活动预支' })
      .expect(201);
    expect(res.body.data.status).toBe('active');

    const detail = await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund/${resource.id}`);
    expect(detail.body.data.reserved).toBe(8000);
    expect(detail.body.data.available).toBe(42000);
  });

  it('释放 400 元，结算剩余 7600 元为花费', async () => {
    const resource = (await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund`)).body.list[0];
    const reservation = (await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund/${resource.id}`)).body;
    // 通过占用列表拿 reservationId：先查流转明细拿到 reservationId
    const ledger = await request(app.getHttpServer()).get(`/spaces/${spaceId}/resources/${resource.id}/ledger`);
    const reservationEntry = ledger.body.list.find((e: { kind: string }) => e.kind === 'reservation');
    const reservationId = reservationEntry.reservationId;

    await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/reservations/${reservationId}/release`)
      .send({ amount: 400 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/reservations/${reservationId}/settle`)
      .send({ amount: 7600 })
      .expect(201);

    const detail = await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund/${resource.id}`);
    expect(detail.body.data.reserved).toBe(0);
    expect(detail.body.data.consumed).toBe(7600);
    expect(detail.body.data.available).toBe(42400);
    expect(detail.body.data.total).toBe(50000);
  });

  it('直接花费 10000 元', async () => {
    const resource = (await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund`)).body.list[0];
    await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/consumptions`)
      .send({ resourceId: resource.id, amount: 10000, sinkKind: 'manual', reason: '报销' })
      .expect(201);

    const detail = await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund/${resource.id}`);
    expect(detail.body.data.consumed).toBe(17600);
    expect(detail.body.data.available).toBe(32400);
  });

  it('可用量不足时拒绝花费', async () => {
    const resource = (await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund`)).body.list[0];
    const res = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/consumptions`)
      .send({ resourceId: resource.id, amount: 999999, sinkKind: 'manual' })
      .expect(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_AVAILABLE');
  });

  it('流转明细可追溯', async () => {
    const resource = (await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund`)).body.list[0];
    const ledger = await request(app.getHttpServer())
      .get(`/spaces/${spaceId}/resources/${resource.id}/ledger?pageSize=50`)
      .expect(200);
    const kinds = ledger.body.list.map((e: { kind: string }) => e.kind);
    expect(kinds).toContain('creation');
    expect(kinds).toContain('reservation');
    expect(kinds).toContain('release');
    expect(kinds).toContain('settle');
    expect(kinds).toContain('consumption');
  });

  it('按空间动态生成 OpenAPI，包含经费类型的路径与字段', async () => {
    const doc = await request(app.getHttpServer())
      .get(`/spaces/${spaceId}/openapi.json`)
      .expect(200);
    expect(doc.body.paths['/fund']).toBeTruthy();
    expect(doc.body.paths['/fund/{id}']).toBeTruthy();
    // 业务属性 project 出现在请求体 schema 中
    const createSchema = doc.body.components.schemas['fund_CreateBody'];
    expect(createSchema.properties.project).toBeTruthy();
    // 四口径出现在响应 schema 中
    const resourceSchema = doc.body.components.schemas['fund_Resource'];
    expect(resourceSchema.properties.total.description).toBe('总量');
    expect(resourceSchema.properties.available.description).toBe('可用量');
    // 动作端点
    expect(doc.body.paths['/creations']).toBeTruthy();
    expect(doc.body.paths['/reservations']).toBeTruthy();
  });

  it('类型停用后已有实例仍可读，仅禁止新建实例', async () => {
    const typeId = (
      await request(app.getHttpServer()).get(`/spaces/${spaceId}/resource-types`)
    ).body.list.find((t: { code: string }) => t.code === 'fund').id;

    await request(app.getHttpServer())
      .patch(`/spaces/${spaceId}/resource-types/${typeId}`)
      .send({ status: 'disabled' })
      .expect(200);

    // 停用后：已有实例列表与详情仍可访问
    const list = await request(app.getHttpServer()).get(`/spaces/${spaceId}/fund`).expect(200);
    expect(list.body.list.length).toBeGreaterThan(0);
    await request(app.getHttpServer())
      .get(`/spaces/${spaceId}/fund/${list.body.list[0].id}`)
      .expect(200);

    // 停用后：创建新实例被拒绝
    const create = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/fund`)
      .send({ domainId, name: '停用后新建' })
      .expect(409);
    expect(create.body.error.code).toBe('RESOURCE_TYPE_DISABLED');

    // 恢复启用，保持环境一致
    await request(app.getHttpServer())
      .patch(`/spaces/${spaceId}/resource-types/${typeId}`)
      .send({ status: 'active' })
      .expect(200);
  });
});
