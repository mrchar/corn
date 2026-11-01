import { computed, ref, watch } from 'vue';
import { listDomains, listSpaces, type Domain, type Space } from '../api';

/** 顶层视图：资源池消费资源，资源类型是空间配置，组织维护空间/领域/群组 */
export const currentView = ref<'pool' | 'types' | 'org'>('pool');

export const menuItems = [
  { key: 'pool', label: '资源池' },
  { key: 'types', label: '资源类型' },
  { key: 'org', label: '组织' },
];

export const spaces = ref<Space[]>([]);
export const spaceId = ref('');
export const domains = ref<Domain[]>([]);
export const domainId = ref('');

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
  const res = await listSpaces();
  spaces.value = res.list;
  if (res.list.length > 0 && !res.list.some((s) => s.id === spaceId.value)) {
    spaceId.value = res.list[0].id;
  }
}

/** 按当前空间重拉领域列表（组织页维护领域后复用） */
export async function reloadDomains() {
  if (!spaceId.value) {
    domains.value = [];
    return;
  }
  const res = await listDomains(spaceId.value);
  domains.value = res.list;
}

/** 应用初始化：加载空间列表并默认选中第一个（幂等，可重复调用） */
export async function initApp() {
  if (inited) return;
  inited = true;
  await reloadSpaces();
}

/** 空间变化时联动加载领域列表，并重置领域筛选 */
watch(spaceId, async (id) => {
  if (!id) {
    domains.value = [];
    domainId.value = '';
    return;
  }
  const res = await listDomains(id);
  domains.value = res.list;
  domainId.value = '';
});
