<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { components, composables } from '@mrchar/cumquat';
import {
  createResourceType,
  deriveFromTemplate,
  listBuiltinTemplates,
  listDomains,
  listResourceTypes,
  updateResourceType,
  type AttributeDef,
  type BuiltinTemplate,
  type Domain,
  type ResourceType,
} from '../api';
import { dataVersion, domainEnabled, spaceId as appSpaceId } from '../store/app';
import AppLayout from '../layouts/AppLayout.vue';

const { Table, Dialog, Button, Space, Select, Input, InputNumber, Switch, Tag, Typography, Empty, FloatButton, Icon } = components;
const { message, useMediaQuery } = composables;

/** 视窗分支：桌面页头文字按钮 / 手机悬浮圆钮，动作同源（与 AppLayout 同断点直查，响应式自动同步） */
const isMobile = useMediaQuery('(max-width: 767px)');

/* ---------- 列表 ---------- */

const refreshTick = ref(0);
const domains = ref<Domain[]>([]);
const templates = ref<BuiltinTemplate[]>([]);

function refresh() {
  refreshTick.value++;
}

/** fetch 属性身份随 refreshTick/dataVersion/spaceId 变化，驱动 Table 重新拉取 */
const fetchFn = computed(() => {
  const sid = appSpaceId.value;
  void refreshTick.value;
  void dataVersion.value; // 智能体等渠道写库后自动重拉
  return (async (query: any) => {
    if (!sid) return { list: [] as any[], total: 0 };
    const res = await listResourceTypes(sid, {
      page: query.page as number | undefined,
      pageSize: query.pageSize as number | undefined,
    });
    return {
      list: res.list.map((t) => ({ ...t, fieldCount: t.attrSchema.length })),
      total: res.total,
    };
  }) as any;
});

/** 使用领域关闭（空间级开关）时隐藏「归属领域」列，资源类型静默归属默认领域 */
const columns = computed(() => [
  { key: 'name', title: '类型名称' },
  { key: 'code', title: '编码' },
  ...(domainEnabled.value ? [{ key: 'domainName', title: '归属领域' }] : []),
  { key: 'unit', title: '计量单位' },
  { key: 'origin', title: '来源', type: 'enum' as const, options: [
    { label: '自定义', value: 'custom' },
    { label: '模板继承', value: 'builtin-inherited' },
    { label: '模板改写', value: 'builtin-rewritten' },
  ]},
  { key: 'status', title: '状态', type: 'enum' as const, options: [
    { label: '启用', value: 'active' },
    { label: '停用', value: 'disabled' },
  ]},
  { key: 'fieldCount', title: '自定义字段' },
  { key: 'resourceCount', title: '实例数' },
  { key: 'actions', title: '操作', width: '150px' },
]);

watch(appSpaceId, async (sid) => {
  domains.value = [];
  templates.value = [];
  if (!sid) return;
  const [domainRes, templateRes] = await Promise.all([
    listDomains(sid),
    listBuiltinTemplates(sid),
  ]);
  domains.value = domainRes.list;
  templates.value = templateRes.list;
}, { immediate: true });

/* ---------- 创建 / 编辑 ---------- */

type ValueType = 'text' | 'number' | 'enum' | 'boolean';
interface AttrRow {
  key: string;
  label: string;
  valueType: ValueType;
  required: boolean;
  optionsText: string;
}

const formOpen = ref(false);
const formMode = ref<'create' | 'update'>('create');
const editing = ref<ResourceType | null>(null);
const form = ref({
  code: '',
  name: '',
  domainId: '',
  description: '',
  unit: '',
  numericScale: 0,
  divisible: true,
  allowNegative: false,
});
const attrRows = ref<AttrRow[]>([]);
/** 编辑时已有的字段 key：这些行由后端冻结（不可删改），只允许追加新行 */
const frozenKeys = ref<string[]>([]);
/** 编辑时类型已被实例使用：影响口径的基础信息不可修改 */
const frozenMeasure = ref(false);

const domainOptions = computed(() =>
  domains.value.map((d) => ({ label: d.name, value: d.id })),
);
const valueTypeOptions = [
  { label: '文本', value: 'text' },
  { label: '数字', value: 'number' },
  { label: '枚举', value: 'enum' },
  { label: '是/否', value: 'boolean' },
];

function openCreate() {
  formMode.value = 'create';
  editing.value = null;
  form.value = {
    code: '',
    name: '',
    domainId: domains.value[0]?.id ?? '',
    description: '',
    unit: '',
    numericScale: 0,
    divisible: true,
    allowNegative: false,
  };
  attrRows.value = [];
  frozenKeys.value = [];
  frozenMeasure.value = false;
  formOpen.value = true;
}

function openUpdate(row: Record<string, unknown>) {
  const t = row as unknown as ResourceType;
  formMode.value = 'update';
  editing.value = t;
  form.value = {
    code: t.code,
    name: t.name,
    domainId: t.domainId,
    description: t.description,
    unit: t.unit,
    numericScale: t.numericScale,
    divisible: t.divisible,
    allowNegative: t.allowNegative,
  };
  attrRows.value = t.attrSchema.map((def) => ({
    key: def.key,
    label: def.label,
    valueType: def.valueType,
    required: !!def.required,
    optionsText: (def.options ?? []).join(','),
  }));
  frozenKeys.value = t.attrSchema.map((def) => def.key);
  frozenMeasure.value = t.inUse;
  formOpen.value = true;
}

function addAttrRow() {
  attrRows.value.push({ key: '', label: '', valueType: 'text', required: false, optionsText: '' });
}

function removeAttrRow(index: number) {
  attrRows.value.splice(index, 1);
}

/** label 填英文时自动预填 key（中文不强转） */
function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function onAttrLabelBlur(row: AttrRow, index: number) {
  if (frozenKeys.value.includes(row.key)) return;
  if (row.key || !row.label) return;
  if (!/^[a-z]/.test(row.label.trim())) return;
  attrRows.value[index].key = slugify(row.label);
}

/** 类型编码规则与后端一致：小写字母开头，仅含小写字母、数字与连字符 */
const typeCodeRule = /^[a-z][a-z0-9-]*$/;
/** 字段 key 规则（后端不限制格式，此处作为前端规范约束） */
const attrKeyRule = /^[a-z][a-z0-9_]*$/;

function validateRows(): string | null {
  if (formMode.value === 'create' && !typeCodeRule.test(form.value.code)) {
    return '编码需以小写字母开头，仅含小写字母、数字与连字符';
  }
  if (!form.value.name.trim()) return '类型名称不能为空';
  if (!form.value.domainId) return '归属领域不能为空';
  if (!form.value.unit.trim()) return '计量单位不能为空';
  const seen = new Set<string>();
  for (const row of attrRows.value) {
    if (!row.key.trim() && !row.label.trim()) continue;
    if (!row.key.trim()) return `字段「${row.label}」缺少 key`;
    if (!attrKeyRule.test(row.key.trim())) return `字段 key「${row.key}」需以小写字母开头，仅含小写字母、数字与下划线`;
    if (seen.has(row.key.trim())) return `字段 key「${row.key}」重复`;
    if (!row.label.trim()) return `字段「${row.key}」缺少名称`;
    if (row.valueType === 'enum' && row.optionsText.split(/[,，]/).map((s) => s.trim()).filter(Boolean).length === 0) {
      return `枚举字段「${row.key}」需提供选项`;
    }
    seen.add(row.key.trim());
  }
  return null;
}

/** 表单行 → AttributeDef[]；编辑模式时已有字段原样保留，只追加新行 */
function buildAttrSchema(): AttributeDef[] {
  const kept = editing.value
    ? editing.value.attrSchema.filter((def) => frozenKeys.value.includes(def.key))
    : [];
  const added = attrRows.value
    .filter((row) => !frozenKeys.value.includes(row.key) && row.key.trim() && row.label.trim())
    .map((row): AttributeDef => {
      const def: AttributeDef = {
        key: row.key.trim(),
        label: row.label.trim(),
        valueType: row.valueType,
      };
      if (row.required) def.required = true;
      if (row.valueType === 'enum') {
        def.options = row.optionsText.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      }
      return def;
    });
  return [...kept, ...added];
}

const submitAction = async () => {
  const invalid = validateRows();
  // 校验失败以异常结束，Dialog 保持打开并展示错误条
  if (invalid) throw new Error(invalid);
  if (formMode.value === 'create') {
    await createResourceType(appSpaceId.value, {
      code: form.value.code,
      name: form.value.name.trim(),
      domainId: form.value.domainId,
      description: form.value.description.trim(),
      unit: form.value.unit.trim(),
      numericScale: Number(form.value.numericScale) || 0,
      divisible: form.value.divisible,
      allowNegative: form.value.allowNegative,
      attrSchema: buildAttrSchema(),
    });
    message.success('资源类型已创建');
  } else if (editing.value) {
    await updateResourceType(appSpaceId.value, editing.value.id, {
      name: form.value.name.trim(),
      domainId: form.value.domainId,
      description: form.value.description.trim(),
      ...(frozenMeasure.value ? {} : {
        unit: form.value.unit.trim(),
        numericScale: Number(form.value.numericScale) || 0,
        divisible: form.value.divisible,
        allowNegative: form.value.allowNegative,
      }),
      attrSchema: buildAttrSchema(),
    });
    message.success('资源类型已更新');
  }
  formOpen.value = false;
  refresh();
};

/* ---------- 停用 / 启用 ---------- */

const toggleStatus = async (row: Record<string, unknown>) => {
  const t = row as unknown as ResourceType;
  const next = t.status === 'active' ? 'disabled' : 'active';
  await updateResourceType(appSpaceId.value, t.id, { status: next });
  message.success(next === 'disabled' ? '类型已停用' : '类型已启用');
  refresh();
};

/* ---------- 从模板派生 ---------- */

const deriveOpen = ref(false);
const deriveTemplateId = ref('');
const deriveMode = ref<'inherit' | 'rewrite'>('inherit');
const deriveDomainId = ref('');

const templateOptions = computed(() =>
  templates.value.map((t) => ({ label: t.name, value: t.id })),
);
const deriveDomainOptions = computed(() =>
  domains.value.map((d) => ({ label: d.name, value: d.id })),
);

function openDerive() {
  deriveTemplateId.value = '';
  deriveMode.value = 'inherit';
  deriveDomainId.value = domains.value[0]?.id ?? '';
  deriveOpen.value = true;
}

const deriveAction = async () => {
  if (!deriveTemplateId.value) throw new Error('请选择内建模板');
  if (!deriveDomainId.value) throw new Error('请选择归属领域');
  await deriveFromTemplate(appSpaceId.value, deriveTemplateId.value, {
    mode: deriveMode.value,
    domainId: deriveDomainId.value,
  });
  message.success(deriveMode.value === 'inherit' ? '已从模板继承创建' : '已从模板改写创建');
  deriveOpen.value = false;
  refresh();
};
</script>

<template>
  <AppLayout>
    <template #title>资源类型</template>
    <template #primary-action>
      <Space v-if="!isMobile">
        <Button @click="openDerive">
          <Icon>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </Icon> 从模板派生
        </Button>
        <Button type="primary" @click="openCreate">
          <Icon><path d="M12 5v14M5 12h14" /></Icon> 新建类型
        </Button>
      </Space>
    </template>

    <Table :columns="columns" :fetch="fetchFn" responsive card-breakpoint="767px">
      <template #cell-actions="{ row }">
        <Space>
          <Button size="sm" @click="openUpdate(row)">编辑</Button>
          <Button size="sm" @click="toggleStatus(row)">
            {{ (row as Record<string, unknown>).status === 'active' ? '停用' : '启用' }}
          </Button>
        </Space>
      </template>
      <template #empty>
        <Empty description="暂无资源类型，点击右上角创建或从模板派生" />
      </template>
    </Table>

    <!-- 创建 / 编辑弹窗 -->
    <Dialog
      v-model:open="formOpen"
      :title="formMode === 'create' ? '新建资源类型' : `编辑资源类型 · ${form.name}`"
      width="640px"
      :action="submitAction"
    >
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px">
        <label style="display: grid; gap: 4px">
          <Typography :level="0">编码 {{ formMode === 'create' ? '' : '（创建后不可改）' }}</Typography>
          <Input v-model="form.code" :disabled="formMode === 'update'" placeholder="如 vehicle-quota" />
        </label>
        <label style="display: grid; gap: 4px">
          <Typography :level="0">类型名称</Typography>
          <Input v-model="form.name" placeholder="如 配额资源" />
        </label>
        <label v-if="domainEnabled" style="display: grid; gap: 4px">
          <Typography :level="0">归属领域</Typography>
          <Select v-model="form.domainId" :options="domainOptions" placeholder="选择领域" />
        </label>
        <label style="display: grid; gap: 4px">
          <Typography :level="0">计量单位{{ frozenMeasure ? '（已有实例，不可修改）' : '' }}</Typography>
          <Input v-model="form.unit" :disabled="frozenMeasure" placeholder="如 个 / 元 / 小时" />
        </label>
        <label style="display: grid; gap: 4px">
          <Typography :level="0">小数位{{ frozenMeasure ? '（不可修改）' : '' }}</Typography>
          <InputNumber v-model="form.numericScale" :disabled="frozenMeasure" :min="0" :max="6" />
        </label>
        <div style="display: flex; align-items: end; gap: 24px; padding-bottom: 2px">
          <label style="display: flex; align-items: center; gap: 6px">
            <Switch v-model="form.divisible" :disabled="frozenMeasure" />
            <Typography :level="0">可拆分</Typography>
          </label>
          <label style="display: flex; align-items: center; gap: 6px">
            <Switch v-model="form.allowNegative" :disabled="frozenMeasure" />
            <Typography :level="0">允许负数</Typography>
          </label>
        </div>
        <label style="display: grid; gap: 4px; grid-column: span 2">
          <Typography :level="0">描述</Typography>
          <Input v-model="form.description" placeholder="类型的用途说明" />
        </label>
      </div>

      <div style="margin-top: 20px">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px">
          <Typography :level="0" style="font-weight: 600">自定义字段</Typography>
          <Button size="sm" @click="addAttrRow">+ 添加字段</Button>
        </div>
        <div
          v-if="attrRows.length === 0"
          style="padding: 12px; color: #6b7280; font-size: 13px; border: 1px dashed #d1d5db; border-radius: 6px"
        >
          暂无自定义字段，资源实例将只包含名称等基础信息
        </div>
        <div
          v-for="(row, index) in attrRows"
          :key="index"
          style="display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f3f4f6"
        >
          <Input
            v-model="row.label"
            :disabled="frozenKeys.includes(row.key)"
            placeholder="字段名（如 项目）"
            style="width: 130px"
            @blur="onAttrLabelBlur(row, index)"
          />
          <Input
            v-model="row.key"
            :disabled="frozenKeys.includes(row.key)"
            placeholder="key（如 project）"
            style="width: 130px"
          />
          <Select
            v-model="row.valueType"
            :options="valueTypeOptions"
            :disabled="frozenKeys.includes(row.key)"
            style="width: 100px"
          />
          <label style="display: flex; align-items: center; gap: 4px; white-space: nowrap">
            <input
              type="checkbox"
              v-model="row.required"
              :disabled="frozenKeys.includes(row.key)"
            />
            <span style="font-size: 13px; white-space: nowrap">必填</span>
          </label>
          <Input
            v-if="row.valueType === 'enum'"
            v-model="row.optionsText"
            :disabled="frozenKeys.includes(row.key)"
            placeholder="枚举选项，逗号分隔"
            style="flex: 1"
          />
          <div v-else style="flex: 1" />
          <Button
            size="sm"
            :disabled="frozenKeys.includes(row.key)"
            @click="removeAttrRow(index)"
          >
            删除
          </Button>
        </div>
        <Typography
          v-if="frozenKeys.length > 0"
          :level="0"
          style="color: #6b7280; margin-top: 8px; font-size: 12px"
        >
          已有 {{ frozenKeys.length }} 个字段被实例引用，仅可追加新字段
        </Typography>
      </div>
    </Dialog>

    <!-- 从模板派生弹窗 -->
    <Dialog v-model:open="deriveOpen" title="从内建模板派生资源类型" width="480px" :action="deriveAction">
      <div style="display: grid; gap: 12px">
        <label style="display: grid; gap: 4px">
          <Typography :level="0">内建模板</Typography>
          <Select v-model="deriveTemplateId" :options="templateOptions" placeholder="选择模板" />
        </label>
        <label style="display: grid; gap: 4px">
          <Typography :level="0">派生方式</Typography>
          <Select
            v-model="deriveMode"
            :options="[
              { label: '继承：沿用模板定义', value: 'inherit' },
              { label: '改写：创建后可再编辑调整', value: 'rewrite' },
            ]"
          />
        </label>
        <label v-if="domainEnabled" style="display: grid; gap: 4px">
          <Typography :level="0">归属领域</Typography>
          <Select v-model="deriveDomainId" :options="deriveDomainOptions" placeholder="选择领域" />
        </label>
      </div>
    </Dialog>

  <!-- 手机端主操作：fixed 定位不受挂载位置影响，动作与桌面页头按钮同源 -->
  <FloatButton
    v-if="isMobile"
    :actions="[
      { key: 'derive', label: '从模板派生' },
      { key: 'create', label: '新建类型' },
    ]"
    @select="(key: string) => (key === 'create' ? openCreate() : openDerive())"
  />
  </AppLayout>
</template>
