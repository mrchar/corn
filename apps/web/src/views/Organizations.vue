<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { components, composables } from '@mrchar/cumquat';
import { rootClient, rootPool, spaceClient, spacePool } from '../services/pools';
import { dataVersion, domains, domainEnabled, groupEnabled, reloadDomains, reloadSpaces, saveUserPrefs, spaceId, spaces, userPrefs } from '../store/app';
import AppLayout from '../layouts/AppLayout.vue';

const { Table, Dialog, Button, Space, Input, Select, Typography, Empty, FloatButton, Icon, List, ListItem, Switch } = components;
const { message, useMediaQuery } = composables;

/** 视窗分支：桌面页头文字按钮 / 手机悬浮圆钮，动作同源 */
const isMobile = useMediaQuery('(max-width: 767px)');

type Section = 'space' | 'domain' | 'group';
const activeSection = ref<Section>('space');
const sectionTitles: Record<Section, string> = { space: '空间', domain: '领域', group: '群组' };

const codeRule = /^[a-z][a-z0-9-]*$/;

/** 三个分区共用的行结构（Table 插槽的 row 为宽类型，传参处断言）；children 为群组嵌套子树 */
interface MetaRow { id: string; code: string; name: string; parentId?: string | null; children?: MetaRow[] }

/** 空间行：附两个空间级配置开关（使用领域/使用群组）；code 由后端返回，前端类型放宽为可选 */
interface SpaceRow { id: string; name: string; code?: string; enableDomain?: boolean; enableGroup?: boolean }

/* ---------- 表格数据：空间/领域来自全局 store，群组页面内管理 ---------- */

const tableKey = ref(0);
const groups = ref<MetaRow[]>([]);

const spacesFetch = async () => ({ list: spaces.value, total: spaces.value.length });
const domainsFetch = async () => ({ list: domains.value, total: domains.value.length });

/** 平铺群组按 parentId 组装为嵌套树，供 List 嵌套渲染（children 由组件展开收起） */
const groupTree = computed<MetaRow[]>(() => {
  const byParent = new Map<string, MetaRow[]>();
  for (const g of groups.value) {
    const key = g.parentId ?? '';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push({ ...g, children: [] });
  }
  const attach = (list?: MetaRow[]): MetaRow[] =>
    (list ?? []).map((node) => ({ ...node, children: attach(byParent.get(node.id)) }));
  return attach(byParent.get(''));
});

/** 上级群组选项：排除编辑目标自身及其后代（防环），创建模式可选全部 */
const parentOptions = computed(() => {
  if (activeSection.value !== 'group') return [];
  const excluded = new Set<string>();
  if (formMode.value === 'update') {
    excluded.add(editingId.value);
    let changed = true;
    while (changed) {
      changed = false;
      for (const g of groups.value) {
        if (g.parentId && excluded.has(g.parentId) && !excluded.has(g.id)) {
          excluded.add(g.id);
          changed = true;
        }
      }
    }
  }
  return [
    { label: '（顶级群组）', value: '' },
    ...groups.value.filter((g) => !excluded.has(g.id)).map((g) => ({ label: g.name, value: g.id })),
  ];
});

async function reloadGroups() {
  const res = await (await spaceClient('groups')).list({ pagination: { currentPage: 1, pageSize: 200 } });
  groups.value = res.list as unknown as MetaRow[];
  tableKey.value++;
}

watch(spaceId, () => reloadGroups(), { immediate: true });
watch(dataVersion, () => reloadGroups()); // 智能体等渠道写库后自动重拉群组

/** 列表列由 OpenAPI 文档投影生成，仅补充行操作列 */
const root = rootPool();
const space = spacePool();

const domainColumns = computed(() => {
  if (!space.has('domains')) return [] as { key: string; title: string }[];
  return [...space.client('domains').columns, { key: 'actions', title: '操作', width: '150px' }];
});

/** 空间表：附两个空间级配置开关列（每个空间分别配置，开关落在卡片底部） */
const spaceColumns = computed(() => {
  if (!root.has('spaces')) return [] as { key: string; title: string }[];
  return [...root.client('spaces').columns, { key: 'actions', title: '操作', width: '150px' }];
});

/* ---------- 弹窗状态：新建/编辑共用 ---------- */

const formOpen = ref(false);
const formMode = ref<'create' | 'update'>('create');
const editingId = ref('');
const form = ref({ code: '', name: '', parentId: '' });

function openForm(mode: 'create' | 'update', section: Section, row?: MetaRow) {
  activeSection.value = section;
  formMode.value = mode;
  editingId.value = row?.id ?? '';
  form.value = { code: row?.code ?? '', name: row?.name ?? '', parentId: row?.parentId ?? '' };
  formOpen.value = true;
}

const formAction = async () => {
  const name = form.value.name.trim();
  if (!name) throw new Error('请输入名称');

  if (activeSection.value === 'space') {
    const client = await rootClient('spaces');
    if (formMode.value === 'create') {
      const code = form.value.code.trim();
      if (!codeRule.test(code)) throw new Error('编码需以小写字母开头，仅含小写字母、数字与连字符');
      await client.create({ code, name });
      message.success('空间已创建');
    } else {
      await client.update(editingId.value, { name });
      message.success('空间已更新');
    }
    await reloadSpaces();
  } else if (activeSection.value === 'domain') {
    const client = await spaceClient('domains');
    if (formMode.value === 'create') {
      const code = form.value.code.trim();
      if (!codeRule.test(code)) throw new Error('编码需以小写字母开头，仅含小写字母、数字与连字符');
      await client.create({ code, name });
      message.success('领域已创建');
    } else {
      await client.update(editingId.value, { name });
      message.success('领域已更新');
    }
    await reloadDomains();
  } else {
    const client = await spaceClient('groups');
    if (formMode.value === 'create') {
      const code = form.value.code.trim();
      if (!codeRule.test(code)) throw new Error('编码需以小写字母开头，仅含小写字母、数字与连字符');
      await client.create({
        code,
        name,
        ...(form.value.parentId ? { parentId: form.value.parentId } : {}),
      });
      message.success('群组已创建');
    } else {
      // 空串 = 移回顶级；后端负责防环校验（自身/后代不可为上级）
      await client.update(editingId.value, {
        name,
        parentId: form.value.parentId || null,
      });
      message.success('群组已更新');
    }
    await reloadGroups();
  }
  formOpen.value = false;
  tableKey.value++;
};

/* ---------- 删除确认 ---------- */

const removeOpen = ref(false);
const removeSection = ref<Section>('domain');
const removeRow = ref<{ id: string; name: string }>({ id: '', name: '' });

const removeHint = computed(() =>
  removeSection.value === 'domain'
    ? `将级联删除领域内的资源类型与资源实例，且不可恢复。`
    : `归属该群组的资源实例将解除关联（资源本身保留），其子群组将提升为顶级。`,
);

function openRemove(section: Section, row: MetaRow) {
  removeSection.value = section;
  removeRow.value = row;
  removeOpen.value = true;
}

const removeAction = async () => {
  if (removeSection.value === 'domain') {
    await (await spaceClient('domains')).remove(removeRow.value.id);
    message.success('领域已删除');
    await reloadDomains();
  } else {
    await (await spaceClient('groups')).remove(removeRow.value.id);
    message.success('群组已删除');
    await reloadGroups();
  }
  removeOpen.value = false;
};

/* ---------- 开关：使用空间（用户级，顶部）；使用领域/使用群组为空间级，配置在各自空间卡片上 ---------- */

/** 可写 computed 兼作开关绑定与失败回滚：写失败时底层状态不变，Switch 自动回弹 */
const spaceToggle = computed({
  get: () => userPrefs.value.enableSpace,
  set: async (val: boolean) => {
    try {
      await saveUserPrefs({ enableSpace: val });
      message.success(val ? '已开启使用空间' : '已关闭使用空间');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败，请稍后重试');
    }
  },
});

/** 关闭约束：已有多个对象时禁止关闭对应开关（服务端强校验，前端禁用态/错误条提示） */
const spaceSwitchDisabled = computed(() => spaces.value.length > 1);
const domainSwitchDisabled = computed(() => domains.value.length > 1);
const groupSwitchDisabled = computed(() => groups.value.length > 1);

/** 空间卡片上的开关：受控绑定（失败不落库自动回弹），当前空间的计数约束前端预禁用，其余空间由服务端 409 把关 */
async function setSpaceFlag(row: SpaceRow, flag: 'enableDomain' | 'enableGroup', val: boolean) {
  try {
    await (await rootClient('spaces')).update(row.id, { [flag]: val });
    await reloadSpaces();
    tableKey.value++;
    message.success(
      val
        ? flag === 'enableDomain' ? '已开启使用领域' : '已开启使用群组'
        : flag === 'enableDomain' ? '已关闭使用领域' : '已关闭使用群组',
    );
  } catch (e) {
    message.error(e instanceof Error ? e.message : '操作失败，请稍后重试');
  }
}

/* ---------- 主操作：分区自包含（桌面分区按钮），手机端悬浮圆钮按可见分区过滤 ---------- */

const fabActions = computed(() => [
  ...(userPrefs.value.enableSpace ? [{ key: 'space', label: '新建空间' }] : []),
  ...(domainEnabled.value ? [{ key: 'domain', label: '新建领域' }] : []),
  ...(groupEnabled.value ? [{ key: 'group', label: '新建群组' }] : []),
]);

function onPrimarySelect(key: string) {
  openForm('create', key as Section);
}
</script>

<template>
  <AppLayout>
    <template #title>组织</template>

    <!-- 开关区：仅使用空间（用户级）；使用领域/使用群组按空间配置，开关在各自空间卡片上 -->
    <section class="org-section org-switches">
      <div class="org-switch-item">
        <div class="org-switch-item__text">
          <Typography :level="0" style="font-weight: 600">使用空间</Typography>
          <Typography :level="0" style="color: #6b7280">开启后可创建多个空间，实现人员隔离；每个空间可单独配置是否使用领域与群组</Typography>
          <Typography v-if="spaceSwitchDisabled" :level="0" style="color: #d97706">已创建多个空间，无法关闭</Typography>
        </div>
        <Switch v-model="spaceToggle" :disabled="spaceSwitchDisabled" />
      </div>
    </section>

    <!-- 空间：未开启使用空间时整体不显示；开启后展示全部空间，卡片上按空间分别配置领域与群组 -->
    <section v-if="userPrefs.enableSpace" class="org-section">
      <div class="org-section__head">
        <div>
          <Typography :level="1">空间</Typography>
          <Typography :level="0" style="color: #6b7280">完全隔离的顶层边界；卡片上的开关按空间分别控制领域与群组的使用</Typography>
        </div>
        <Button v-if="!isMobile" @click="openForm('create', 'space')">
          <Icon><path d="M12 5v14M5 12h14" /></Icon> 新建空间
        </Button>
      </div>
      <Table :key="`sp-${tableKey}`" :columns="spaceColumns" :fetch="spacesFetch" responsive card-breakpoint="767px">
        <template #cell-enableDomain="{ row }">
          <Switch
            :model-value="!!(row as unknown as SpaceRow).enableDomain"
            :disabled="(row as unknown as SpaceRow).id === spaceId && domainSwitchDisabled"
            :title="domainSwitchDisabled ? '已创建多个领域，无法关闭' : undefined"
            style="white-space: nowrap; flex-shrink: 0"
            @update:model-value="(v: boolean) => setSpaceFlag(row as unknown as SpaceRow, 'enableDomain', v)"
          />
        </template>
        <template #cell-enableGroup="{ row }">
          <Switch
            :model-value="!!(row as unknown as SpaceRow).enableGroup"
            :disabled="(row as unknown as SpaceRow).id === spaceId && groupSwitchDisabled"
            :title="groupSwitchDisabled ? '已创建多个群组，无法关闭' : undefined"
            style="white-space: nowrap; flex-shrink: 0"
            @update:model-value="(v: boolean) => setSpaceFlag(row as unknown as SpaceRow, 'enableGroup', v)"
          />
        </template>
        <template #cell-actions="{ row }">
          <Button size="sm" style="white-space: nowrap; flex-shrink: 0" @click="openForm('update', 'space', row as unknown as MetaRow)">重命名</Button>
        </template>
      </Table>
    </section>

    <!-- 领域 -->
    <section v-if="domainEnabled" class="org-section">
      <div class="org-section__head">
        <div>
          <Typography :level="1">领域</Typography>
          <Typography :level="0" style="color: #6b7280">当前空间内的分区，资源归属与类型定义的最小单位</Typography>
        </div>
        <Button v-if="!isMobile" @click="openForm('create', 'domain')">
          <Icon><path d="M12 5v14M5 12h14" /></Icon> 新建领域
        </Button>
      </div>
      <Table :key="`dm-${tableKey}`" :columns="domainColumns" :fetch="domainsFetch" responsive card-breakpoint="767px">
        <template #cell-actions="{ row }">
          <Space>
            <Button size="sm" style="white-space: nowrap; flex-shrink: 0" @click="openForm('update', 'domain', row as unknown as MetaRow)">编辑</Button>
            <Button size="sm" style="white-space: nowrap; flex-shrink: 0" @click="openRemove('domain', row as unknown as MetaRow)">删除</Button>
          </Space>
        </template>
      </Table>
    </section>

    <!-- 群组 -->
    <section v-if="groupEnabled" class="org-section">
      <div class="org-section__head">
        <div>
          <Typography :level="1">群组</Typography>
          <Typography :level="0" style="color: #6b7280">当前空间内的成员编组，可作为资源归属与权限投影源</Typography>
        </div>
        <Button v-if="!isMobile" @click="openForm('create', 'group')">
          <Icon><path d="M12 5v14M5 12h14" /></Icon> 新建群组
        </Button>
      </div>
      <List :key="`gp-${tableKey}`" :items="groupTree" :row-key="(g: any) => (g as MetaRow).id" default-expand-all empty-text="暂无群组">
        <template #item="{ item, depth, hasChildren, expanded, toggle }">
          <ListItem :style="{ paddingInlineStart: `calc(1rem + ${depth * 1.25}rem)` }">
            <template #default>
              <button
                v-if="hasChildren"
                type="button"
                class="group-expander"
                :class="{ 'group-expander--expanded': expanded }"
                :aria-label="expanded ? '收起' : '展开'"
                @click="toggle"
              >
                <Icon><path d="m9 18 6-6-6-6" /></Icon>
              </button>
              <div class="group-item__text">
                <Typography :level="0">{{ (item as MetaRow).name }}</Typography>
                <Typography :level="0" class="group-item__code">{{ (item as MetaRow).code }}</Typography>
              </div>
            </template>
            <template #actions>
              <Space>
                <Button size="sm" style="white-space: nowrap; flex-shrink: 0" @click="openForm('update', 'group', item as MetaRow)">编辑</Button>
                <Button size="sm" style="white-space: nowrap; flex-shrink: 0" @click="openRemove('group', item as MetaRow)">删除</Button>
              </Space>
            </template>
          </ListItem>
        </template>
      </List>
    </section>

    <!-- 手机端主操作：fixed 定位不受挂载位置影响 -->
    <FloatButton v-if="isMobile" :actions="fabActions" @select="onPrimarySelect" />

    <!-- 新建 / 编辑弹窗 -->
    <Dialog
      v-model:open="formOpen"
      :title="`${formMode === 'create' ? '新建' : '编辑'}${sectionTitles[activeSection]}`"
      :action="formAction"
    >
      <div style="display: grid; gap: 12px">
        <label v-if="formMode === 'create'" style="display: grid; gap: 4px">
          <Typography :level="0">编码（创建后不可改）</Typography>
          <Input v-model="form.code" placeholder="如 ops-team" />
        </label>
        <label style="display: grid; gap: 4px">
          <Typography :level="0">名称</Typography>
          <Input v-model="form.name" placeholder="如 运维团队" />
        </label>
        <label v-if="activeSection === 'group'" style="display: grid; gap: 4px">
          <Typography :level="0">上级群组</Typography>
          <Select v-model="form.parentId" :options="parentOptions" placeholder="不选则为顶级群组" />
        </label>
      </div>
    </Dialog>

    <!-- 删除确认弹窗 -->
    <Dialog v-model:open="removeOpen" :title="`删除${sectionTitles[removeSection]} · ${removeRow.name}`" :action="removeAction">
      <div style="display: grid; gap: 8px">
        <Typography :level="0">确认删除「{{ removeRow.name }}」？</Typography>
        <Typography :level="0" style="color: #dc2626">{{ removeHint }}</Typography>
      </div>
    </Dialog>
  </AppLayout>
</template>

<style scoped>
.org-section {
  display: grid;
  gap: 12px;
  margin-bottom: 28px;
}

/* 开关区：三行开关（名称+说明左对齐，开关右对齐），带边框卡片化 */
.org-switches {
  gap: 0;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 4px 16px;
  background: #fff;
}

.org-switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
}

.org-switch-item + .org-switch-item {
  border-top: 1px solid #f3f4f6;
}

.org-switch-item__text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.org-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

/* 群组嵌套：展开箭头（收起朝右，展开朝下）+ 名称/编码两行文本 */
.group-expander {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  flex-shrink: 0;
}

.group-expander svg {
  transition: transform 0.15s ease;
}

.group-expander--expanded svg {
  transform: rotate(90deg);
}

.group-item__text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.group-item__code {
  color: #9ca3af;
  font-size: 12px;
}
</style>
