import { computed, ref, watch } from 'vue';
import { listDomains, listSpaces, type Domain, type Space } from '../api';

/** 顶层视图：资源池消费资源，资源类型是空间配置 */
export const currentView = ref<'pool' | 'types'>('pool');

export const menuItems = [
  { key: 'pool', label: '资源池' },
  { key: 'types', label: '资源类型' },
];

export const spaces = ref<Space[]>([]);
export const spaceId = ref('');
export const domains = ref<Domain[]>([]);
export const domainId = ref('');

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

/** 应用初始化：加载空间列表并默认选中第一个（幂等，可重复调用） */
export async function initApp() {
  if (inited) return;
  inited = true;
  const res = await listSpaces();
  spaces.value = res.list;
  if (res.list.length > 0) {
    spaceId.value = res.list[0].id;
  }
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
