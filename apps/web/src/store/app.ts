import { computed, ref, watch } from 'vue';
import { rootClient, spaceClient } from '../services/pools';

/** 顶层视图：资源池消费资源，资源类型是空间配置，组织维护空间/领域/群组 */
export const currentView = ref<'pool' | 'types' | 'org'>('pool');

export const menuItems = [
  { key: 'pool', label: '资源池' },
  { key: 'types', label: '资源类型' },
  { key: 'org', label: '组织' },
];

export interface Space {
  id: string;
  code: string;
  name: string;
  /** 使用领域开关（空间级）：关闭时领域概念全空间不可见 */
  enableDomain?: boolean;
  /** 使用群组开关（空间级）：关闭时群组概念全空间不可见 */
  enableGroup?: boolean;
  createdAt?: string;
}

export interface Domain {
  id: string;
  code: string;
  name: string;
}

export const spaces = ref<Space[]>([]);
export const spaceId = ref('');
export const domains = ref<Domain[]>([]);
export const domainId = ref('');

/* ---------- 组织概念显隐开关 ---------- */

/** 用户级偏好：使用空间（关闭时仅使用默认空间，侧栏不出现空间选择器） */
export const userPrefs = ref({ enableSpace: false });

/** 当前空间对象：空间级开关（使用领域/使用群组）的载体 */
export const currentSpace = computed(() => spaces.value.find((s) => s.id === spaceId.value));
/** 领域概念对当前空间是否可见：关闭时所有领域选项兜底默认领域 */
export const domainEnabled = computed(() => currentSpace.value?.enableDomain ?? false);
/** 群组概念对当前空间是否可见：关闭时所有群组选项兜底默认群组 */
export const groupEnabled = computed(() => currentSpace.value?.enableGroup ?? false);

/** 拉取用户偏好（initApp 时调用） */
export async function loadUserPrefs() {
  try {
    const me = (await (await rootClient('users')).detail('me')) as { enableSpace: boolean };
    userPrefs.value = { enableSpace: me.enableSpace };
  } catch {
    /* 偏好拉取失败按默认关闭处理 */
  }
}

/** 更新用户级偏好（组织页开关用） */
export async function saveUserPrefs(patch: { enableSpace?: boolean }) {
  const me = (await (await rootClient('users')).update('me', patch)) as { enableSpace: boolean };
  userPrefs.value = { enableSpace: me.enableSpace };
}

/** 全局数据版本号：任意写操作成功后递增，驱动各视图重新拉取列表（智能体写库后页面即时反映） */
export const dataVersion = ref(0);

export const spaceOptions = computed(() =>
  spaces.value.map((s) => ({ label: s.name, value: s.id })),
);
export const domainOptions = computed(() => [
  { label: '全部领域', value: '' },
  ...domains.value.map((d) => ({ label: d.name, value: d.id })),
]);

/** 当前视图对应的菜单项，供布局显示标题 */
export const activeMenuItem = computed(
  () => menuItems.find((m) => m.key === currentView.value) ?? menuItems[0],
);

let inited = false;

/** 拉取空间列表并保底选中一个有效空间（组织页增删改后复用） */
export async function reloadSpaces() {
  const res = await (await rootClient('spaces')).list({ pagination: { currentPage: 1, pageSize: 200 } });
  spaces.value = res.list as unknown as Space[];
  if (spaces.value.length > 0 && !spaces.value.some((s) => s.id === spaceId.value)) {
    spaceId.value = spaces.value[0].id;
  }
}

/** 按当前空间重拉领域列表（组织页维护领域后复用） */
export async function reloadDomains() {
  if (!spaceId.value) {
    domains.value = [];
    return;
  }
  const res = await (await spaceClient('domains')).list({ pagination: { currentPage: 1, pageSize: 200 } });
  domains.value = res.list as unknown as Domain[];
}

/** 应用初始化：加载用户偏好与空间列表并默认选中第一个（幂等，可重复调用） */
export async function initApp() {
  if (inited) return;
  inited = true;
  await loadUserPrefs();
  await reloadSpaces();
}

/** 空间变化时联动加载领域列表，并重置领域筛选 */
watch(spaceId, async (id) => {
  if (!id) {
    domains.value = [];
    domainId.value = '';
    return;
  }
  const res = await (await spaceClient('domains')).list({ pagination: { currentPage: 1, pageSize: 200 } });
  domains.value = res.list as unknown as Domain[];
  domainId.value = '';
});
