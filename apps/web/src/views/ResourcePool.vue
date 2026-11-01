<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { components, composables } from '@mrchar/cumquat';
import type { ResourceField, ResourceClient } from '@mrchar/cumquat/composables';
import {
  createConsumption,
  createCreation,
  createReservation,
  listLedger,
  listReservations,
  releaseReservation,
  settleReservation,
  type LedgerEntry,
  type Reservation,
} from '../api';
import { dataVersion, domains, domainId, domainOptions, spaceId } from '../store/app';
import AppLayout from '../layouts/AppLayout.vue';

const { Table, Form, Dialog, Drawer, Button, Space, Typography, Descriptions, Tabs, Empty, Dropdown, Select, FloatButton, Icon } = components;
const { useResources, message, useMediaQuery } = composables;

/** 视窗分支：桌面页头文字按钮 / 手机悬浮圆钮，动作同源（与 AppLayout 同断点直查，响应式自动同步） */
const isMobile = useMediaQuery('(max-width: 767px)');

const pool = useResources({
  server: `/spaces/${spaceId.value}`,
  doc: '/openapi.json',
  refine: (schema) => {
    const resources = { ...(schema.resources ?? {}) };
    delete resources['流转'];
    return { resources };
  },
});

const activeType = ref<string>('');
const typeNames = ref<string[]>([]);

watch(() => pool.names, (names) => {
  typeNames.value = [...names];
  if (names.length > 0 && !names.includes(activeType.value)) {
    activeType.value = names[0];
  }
}, { immediate: true });

const client = computed<ResourceClient | null>(() => {
  if (!activeType.value || !pool.has(activeType.value)) return null;
  return pool.client(activeType.value);
});

const columns = computed(() => {
  if (!client.value) return [];
  return [
    ...client.value.columns,
    { key: 'actions', title: '操作', width: '150px' },
  ];
});

/** fetch 属性身份随 activeType/domainId/dataVersion 变化，驱动 Table 重新拉取 */
const fetchFn = computed(() => {
  const current = client.value;
  const domainFilter = domainId.value;
  void dataVersion.value; // 智能体等渠道写库后自动重拉
  return (async (query: any) => {
    if (!current) return { list: [] as any[], total: 0 };
    const filters = { ...(query.filters ?? {}) };
    if (domainFilter) filters.domainId = domainFilter;
    return current.list({ ...query, filters });
  }) as any;
});

/* ---------- 创建 / 编辑 ---------- */

const formOpen = ref(false);
const formMode = ref<'create' | 'update'>('create');
const editingId = ref<string>('');
const formValues = ref<Record<string, unknown>>({});

const formProperties = computed<ResourceField[]>(() => {
  if (!client.value) return [];
  const propsList = client.value.properties.filter((f: ResourceField) =>
    formMode.value === 'create' ? f.scope?.create : f.scope?.update,
  );
  return propsList.map((f: ResourceField) => {
    if (f.name === 'domainId') {
      return {
        name: f.name,
        label: f.label,
        type: 'enum' as const,
        options: domains.value.map((d) => ({ label: d.name, value: d.id })),
        control: 'select',
        required: true,
      };
    }
    return f;
  });
});

function openCreate() {
  formMode.value = 'create';
  editingId.value = '';
  formValues.value = { domainId: domains.value[0]?.id ?? '' };
  formOpen.value = true;
}

async function openUpdate(row: Record<string, unknown>) {
  formMode.value = 'update';
  editingId.value = row.id as string;
  if (client.value) {
    const env = await client.value.detail(row.id as string) as { data?: Record<string, unknown> };
    formValues.value = env.data ? { ...env.data } : {};
  }
  formOpen.value = true;
}

const formAction = async () => {
  if (!client.value) return;
  if (formMode.value === 'create') {
    await client.value.create(formValues.value);
    message.success('创建成功');
  } else {
    await client.value.update(editingId.value, formValues.value);
    message.success('更新成功');
  }
  formOpen.value = false;
  refreshTable();
};

/* ---------- 详情抽屉 ---------- */

const detailOpen = ref(false);
const detailRow = ref<Record<string, unknown>>({});
const ledgerEntries = ref<LedgerEntry[]>([]);
const reservations = ref<Reservation[]>([]);
const tableRef = ref();
const tableKey = ref(0);

function refreshTable() {
  tableKey.value++;
}

async function openDetail(row: Record<string, unknown>) {
  detailRow.value = row;
  detailOpen.value = true;
  await reloadDetail(row.id as string);
}

/** 动作完成后从服务端重新拉取资源详情与占用/流转列表，避免展示过期快照 */
async function reloadDetail(resourceId: string) {
  const [detailEnv, ledger, res] = await Promise.all([
    client.value?.detail(resourceId) as Promise<{ data?: Record<string, unknown> }> | undefined,
    listLedger(spaceId.value, resourceId),
    listReservations(spaceId.value, resourceId),
  ]);
  if (detailEnv?.data) detailRow.value = detailEnv.data;
  ledgerEntries.value = ledger.list;
  reservations.value = res.list;
}

const detailItems = computed(() => {
  const row = detailRow.value;
  if (!row || Object.keys(row).length === 0) return [];
  return [
    { label: '名称', value: String(row.name ?? '') },
    { label: '类型', value: String(row.typeName ?? '') },
    { label: '领域', value: String(row.domainName ?? '') },
    { label: '计量单位', value: String(row.unit ?? '') },
    { label: '状态', value: row.status === 'archived' ? '已归档' : '正常' },
    { label: '总量', value: String(row.total ?? 0) },
    { label: '已占用', value: String(row.reserved ?? 0) },
    { label: '已消耗', value: String(row.consumed ?? 0) },
    { label: '可用量', value: String(row.available ?? 0) },
    { label: '创建时间', value: String(row.createdAt ?? '') },
  ];
});

/* ---------- 动作弹窗：注入 / 占用 / 花费 ---------- */

const actionKind = ref<'creation' | 'reservation' | 'consumption'>('creation');
const actionOpen = ref(false);
const actionTarget = ref<Record<string, unknown>>({});
const actionForm = ref<Record<string, unknown>>({});

function openAction(kind: 'creation' | 'reservation' | 'consumption', row: Record<string, unknown>) {
  actionKind.value = kind;
  actionTarget.value = row;
  actionForm.value = { amount: 0, reason: '' };
  actionOpen.value = true;
}

const actionTitle = computed(() => ({
  creation: `注入 ${actionTarget.value.name ?? ''}`,
  reservation: `占用 ${actionTarget.value.name ?? ''}`,
  consumption: `花费 ${actionTarget.value.name ?? ''}`,
}[actionKind.value]));

const actionAction = async () => {
  const targetId = actionTarget.value.id as string;
  const amount = Number(actionForm.value.amount);
  const reason = actionForm.value.reason as string | undefined;
  if (actionKind.value === 'creation') {
    await createCreation(spaceId.value, { resourceId: targetId, amount, sourceKind: 'manual', reason });
    message.success('注入成功');
  } else if (actionKind.value === 'reservation') {
    await createReservation(spaceId.value, {
      resourceId: targetId,
      amount,
      purpose: reason,
    });
    message.success('占用成功');
  } else {
    await createConsumption(spaceId.value, { resourceId: targetId, amount, sinkKind: 'manual', reason });
    message.success('花费已登记');
  }
  actionOpen.value = false;
  refreshTable();
  if (detailOpen.value) await reloadDetail(targetId);
};

/* ---------- 释放 / 结算占用 ---------- */

const releaseOpen = ref(false);
const releaseMode = ref<'release' | 'settle'>('release');
const releaseTarget = ref<Reservation | null>(null);
const releaseForm = ref<Record<string, unknown>>({ amount: 0, reason: '' });

function openRelease(mode: 'release' | 'settle', r: Reservation) {
  releaseMode.value = mode;
  releaseTarget.value = r;
  const remaining = r.amount - r.releasedAmount - r.settledAmount;
  releaseForm.value = { amount: remaining, reason: '' };
  releaseOpen.value = true;
}

const releaseAction = async () => {
  if (!releaseTarget.value) return;
  const amount = Number(releaseForm.value.amount);
  const reason = releaseForm.value.reason as string | undefined;
  if (releaseMode.value === 'release') {
    await releaseReservation(spaceId.value, releaseTarget.value.id, { amount, reason });
    message.success('释放成功');
  } else {
    await settleReservation(spaceId.value, releaseTarget.value.id, { amount, reason });
    message.success('结算成功');
  }
  releaseOpen.value = false;
  refreshTable();
  if (detailOpen.value) await reloadDetail(detailRow.value.id as string);
};

/* ---------- 删除 ---------- */

const removeAction = async (row: Record<string, unknown>) => {
  if (!client.value) return;
  await client.value.remove(row.id as string);
  message.success('已归档');
  refreshTable();
};

/* ---------- 行操作下拉：详情平铺，次要动作收纳 ---------- */

interface RowMenuItem { key: string; label: string }

const rowMenuItems: RowMenuItem[] = [
  { key: 'edit', label: '编辑' },
  { key: 'creation', label: '注入' },
  { key: 'reservation', label: '占用' },
  { key: 'consumption', label: '花费' },
  { key: 'archive', label: '归档' },
];

function onRowMenuSelect(row: Record<string, unknown>, item: RowMenuItem) {
  if (item.key === 'edit') {
    openUpdate(row);
  } else if (item.key === 'archive') {
    removeAction(row);
  } else {
    openAction(item.key as 'creation' | 'reservation' | 'consumption', row);
  }
}

const reservationColumns = [
  { key: 'amount', title: '占用量' },
  { key: 'status', title: '状态', type: 'enum' as const, options: [
    { label: '有效', value: 'active' },
    { label: '已释放', value: 'released' },
    { label: '已结算', value: 'settled' },
  ]},
  { key: 'releasedAmount', title: '已释放' },
  { key: 'settledAmount', title: '已结算' },
  { key: 'purpose', title: '用途' },
  { key: 'createdAt', title: '创建时间' },
  { key: 'actions', title: '操作', width: '160px' },
];

const ledgerColumns = [
  { key: 'kind', title: '类型', type: 'enum' as const, options: [
    { label: '注入', value: 'creation' },
    { label: '占用', value: 'reservation' },
    { label: '释放', value: 'release' },
    { label: '结算', value: 'settle' },
    { label: '花费', value: 'consumption' },
  ]},
  { key: 'amount', title: '数量' },
  { key: 'totalDelta', title: '总量变化' },
  { key: 'reservedDelta', title: '占用变化' },
  { key: 'consumedDelta', title: '消耗变化' },
  { key: 'reason', title: '说明' },
  { key: 'occurredAt', title: '时间' },
];
</script>

<template>
  <AppLayout>
    <template #title>资源池</template>
    <template #filters>
      <Select
        v-model="domainId"
        :options="domainOptions"
        placeholder="领域筛选"
        style="width: 160px"
        :disabled="!spaceId"
      />
    </template>
    <template #primary-action>
      <Button v-if="!isMobile" type="primary" @click="openCreate">
        <Icon><path d="M12 5v14M5 12h14" /></Icon> 新建
      </Button>
    </template>

    <div v-if="pool.state.status === 'pending'" style="text-align: center; padding: 48px">
      <Typography :level="0" style="color: #6b7280">正在加载资源元数据…</Typography>
    </div>
    <div v-else-if="pool.state.status === 'error'" style="text-align: center; padding: 48px">
      <Typography :level="0" style="color: #dc2626">元数据加载失败</Typography>
    </div>
    <div v-else-if="typeNames.length === 0">
      <Empty description="当前空间暂无可用资源类型" />
    </div>
    <div v-else>
      <Tabs v-model="activeType" :tabs="typeNames.map((n: string) => ({ key: n, label: n }))" />

      <div style="margin-top: 16px">
      <Table
        :key="tableKey"
        ref="tableRef"
        :columns="columns"
        :fetch="fetchFn"
        :pagination="true"
        :page-size="20"
        responsive
        card-breakpoint="767px"
        :row-key="(row: any) => row.id"
      >
        <template #cell-actions="{ row }">
          <!-- 过渡方案：按钮禁用收缩撑起列 min-content，待组件库输出 min-width 后移除 -->
          <Space style="flex-wrap: nowrap">
            <Button size="sm" style="white-space: nowrap; flex-shrink: 0" @click="openDetail(row)">详情</Button>
            <Dropdown :items="rowMenuItems" @select="(item: RowMenuItem) => onRowMenuSelect(row, item)">
              <template #trigger>
                <Button size="sm" style="white-space: nowrap; flex-shrink: 0">更多</Button>
              </template>
            </Dropdown>
          </Space>
        </template>
      </Table>
    </div>
  </div>

  <!-- 创建 / 编辑弹窗 -->
  <Dialog
    v-model:open="formOpen"
    :title="formMode === 'create' ? '新建资源' : '编辑资源'"
    :action="formAction"
    width="520px"
  >
    <Form
      v-if="formOpen"
      v-model="formValues"
      :properties="formProperties"
      label-position="top"
    />
  </Dialog>

  <!-- 详情抽屉 -->
  <Drawer v-model:open="detailOpen" title="资源详情" direction="right" size="640px">
    <Descriptions :items="detailItems" :column="2" bordered />

    <Typography :level="3" style="display: block; margin: 24px 0 8px">占用记录</Typography>
    <Table
      :columns="reservationColumns"
      :rows="reservations"
      :row-key="(row: any) => row.id"
      size="sm"
    >
      <template #cell-actions="{ row }">
        <Space v-if="row.status === 'active'">
          <Button size="sm" @click="openRelease('release', row as unknown as Reservation)">释放</Button>
          <Button size="sm" @click="openRelease('settle', row as unknown as Reservation)">结算</Button>
        </Space>
      </template>
    </Table>

    <Typography :level="3" style="display: block; margin: 24px 0 8px">流转明细</Typography>
    <Table :columns="ledgerColumns" :rows="ledgerEntries" :row-key="(row: any) => row.id" size="sm" />
  </Drawer>

  <!-- 动作弹窗 -->
  <Dialog
    v-model:open="actionOpen"
    :title="actionTitle"
    :action="actionAction"
    width="420px"
  >
    <Form
      v-if="actionOpen"
      v-model="actionForm"
      label-position="top"
      :properties="[
        { name: 'amount', label: '数量', type: 'number' as const, required: true },
        { name: 'reason', label: actionKind === 'reservation' ? '用途' : '说明', type: 'string' as const },
      ]"
    />
  </Dialog>

  <!-- 释放 / 结算弹窗 -->
  <Dialog
    v-model:open="releaseOpen"
    :title="releaseMode === 'release' ? '释放占用' : '结算占用'"
    :action="releaseAction"
    width="420px"
  >
    <Form
      v-if="releaseOpen && releaseTarget"
      v-model="releaseForm"
      label-position="top"
      :properties="[
        { name: 'amount', label: '数量', type: 'number' as const, required: true },
        { name: 'reason', label: '说明', type: 'string' as const },
      ]"
    />
  </Dialog>

  <!-- 手机端主操作：fixed 定位不受挂载位置影响，动作与桌面页头按钮同源 -->
  <FloatButton v-if="isMobile" :actions="[{ key: 'create', label: '新建资源' }]" @select="(key: string) => key === 'create' && openCreate()" />
  </AppLayout>
</template>
