import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { stringifyJson } from './common/json';

const prisma = new PrismaClient();

/**
 * 内建资源模板：覆盖全部组织对象（成员、群组、领域、空间）。
 * 这些模板由系统预置、只读；空间管理员决定是否启用，领域管理员决定继承或改写。
 */
const BUILTIN_TEMPLATES = [
  {
    code: 'human-resource',
    name: '人力资源',
    description: '组织内成员作为可计量的人力载体，常用于工时/人头口径',
    projectionSubject: 'member',
    unit: '人天',
    numericScale: 1,
    divisible: true,
    allowNegative: false,
    attrSchema: [
      { key: 'grade', label: '职级', valueType: 'text' },
      { key: 'skill', label: '技能方向', valueType: 'text' },
    ],
    sourceKinds: ['manual', 'timed', 'builtin'],
    sinkKinds: ['manual', 'event'],
    recommendedTagKeys: [],
  },
  {
    code: 'group-resource',
    name: '组织资源',
    description: '群组作为组织资源的承载口径',
    projectionSubject: 'group',
    unit: '个',
    numericScale: 0,
    divisible: false,
    allowNegative: false,
    attrSchema: [{ key: 'scope', label: '职责范围', valueType: 'text' }],
    sourceKinds: ['manual', 'builtin'],
    sinkKinds: ['manual'],
    recommendedTagKeys: [],
  },
  {
    code: 'domain-resource',
    name: '领域资源',
    description: '领域本身作为组织资源的承载口径',
    projectionSubject: 'domain',
    unit: '个',
    numericScale: 0,
    divisible: false,
    allowNegative: false,
    attrSchema: [{ key: 'mission', label: '使命', valueType: 'text' }],
    sourceKinds: ['manual', 'builtin'],
    sinkKinds: ['manual'],
    recommendedTagKeys: [],
  },
  {
    code: 'space-asset',
    name: '空间资产',
    description: '空间级场所/资产类资源',
    projectionSubject: 'space',
    unit: '平方米',
    numericScale: 2,
    divisible: true,
    allowNegative: false,
    attrSchema: [
      { key: 'location', label: '位置', valueType: 'text', required: true },
      { key: 'capacity', label: '容纳人数', valueType: 'number' },
    ],
    sourceKinds: ['manual', 'event'],
    sinkKinds: ['manual', 'wear', 'event'],
    recommendedTagKeys: [],
  },
  {
    code: 'fund',
    name: '经费',
    description: '资金类资源，可分割、按金额计量',
    projectionSubject: '',
    unit: '元',
    numericScale: 2,
    divisible: true,
    allowNegative: false,
    attrSchema: [
      { key: 'project', label: '所属项目', valueType: 'text' },
      { key: 'fiscalYear', label: '财年', valueType: 'number' },
    ],
    sourceKinds: ['manual', 'timed', 'event'],
    sinkKinds: ['manual', 'event'],
    recommendedTagKeys: [],
  },
  {
    code: 'material',
    name: '物资',
    description: '生产/办公物资，支持自然损耗',
    projectionSubject: '',
    unit: '件',
    numericScale: 0,
    divisible: true,
    allowNegative: false,
    attrSchema: [
      { key: 'category', label: '品类', valueType: 'enum', options: ['办公用品', '生产原料', '设备配件', '其他'] },
      { key: 'expireAt', label: '保质期截止', valueType: 'text' },
    ],
    sourceKinds: ['manual', 'event'],
    sinkKinds: ['manual', 'wear', 'event'],
    recommendedTagKeys: [],
  },
];

async function seed(): Promise<void> {
  const existing = await prisma.builtinTemplate.findMany({ select: { code: true } });
  const existingCodes = new Set(existing.map((row) => row.code));
  const toCreate = BUILTIN_TEMPLATES.filter((t) => !existingCodes.has(t.code));
  if (toCreate.length > 0) {
    await prisma.builtinTemplate.createMany({
      data: toCreate.map((t) => ({
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
  }

  // 演示空间：若已存在则跳过
  let space = await prisma.space.findUnique({ where: { code: 'demo' } });
  if (!space) {
    space = await prisma.space.create({ data: { id: 'sp_demo', code: 'demo', name: '演示空间' } });
  }

  let domain = await prisma.domain.findFirst({ where: { spaceId: space.id, code: 'general' } });
  if (!domain) {
    domain = await prisma.domain.create({
      data: { id: 'dm_demo_general', spaceId: space.id, code: 'general', name: '通用领域' },
    });
  }

  // 在演示空间启用全部内建模板
  const templates = await prisma.builtinTemplate.findMany();
  for (const template of templates) {
    await prisma.spaceTemplateSetting.upsert({
      where: { spaceId_templateId: { spaceId: space.id, templateId: template.id } },
      create: { spaceId: space.id, templateId: template.id, enabled: true },
      update: { enabled: true },
    });
  }

  // 资源类型不再由模板派生：类型完全由用户在配置页面创建，模板仅作「从模板派生」的快捷预设
  console.log(`seeded: space=${space.code}, domain=${domain.code}, templates=${templates.length}`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
