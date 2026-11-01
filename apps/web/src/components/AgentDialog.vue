<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { components } from '@mrchar/cumquat';
import type { AgentActivity, AgentPhase, PendingConfirmation } from '../services/agent';

const { Button, Drawer } = components;

const props = defineProps<{
  open: boolean;
  phase: AgentPhase;
  activity: AgentActivity[];
  pending: PendingConfirmation | null;
  pendingTotal: number;
  finalText: string;
  lastError: string;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
  close: [];
}>();

const PHASE_LABELS: Record<AgentPhase, string> = {
  thinking: 'AI 正在思考…',
  confirming: '等待确认',
  executing: '正在执行…',
  done: '已完成',
};

const phaseLabel = computed(() => {
  if (props.phase !== 'done') return PHASE_LABELS[props.phase];
  return props.lastError ? '已中断' : '已完成';
});

const busy = computed(() => props.phase === 'thinking' || props.phase === 'executing');

/** 过程日志随新条目/结果更新自动滚动到底部 */
const logRef = ref<HTMLElement | null>(null);
watch(
  () => {
    const last = props.activity[props.activity.length - 1];
    return [props.activity.length, last?.text ?? '', last?.detail ?? ''];
  },
  () => {
    void nextTick(() => {
      const el = logRef.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  },
);

/* ---------- 操作卡片：结构化解析 execute 入参（文案已在入队时由 confirm 生成） ---------- */

const ACTION_BADGES: Record<string, { label: string; tone: string }> = {
  create: { label: '创建', tone: 'green' },
  rename: { label: '改名', tone: 'blue' },
  move: { label: '移动', tone: 'blue' },
  delete: { label: '删除', tone: 'red' },
  disable: { label: '停用', tone: 'orange' },
  enable: { label: '启用', tone: 'green' },
  inject: { label: '注入', tone: 'blue' },
  reserve: { label: '占用', tone: 'orange' },
  release: { label: '释放', tone: 'cyan' },
  settle: { label: '结算', tone: 'purple' },
  consume: { label: '花费', tone: 'red' },
};

const opCard = computed(() => {
  const p = props.pending;
  if (!p) return null;
  const input = p.input;
  const action = String(input.action ?? '');
  const badge = ACTION_BADGES[action] ?? { label: action || '操作', tone: 'gray' };
  const fields: Array<{ label: string; value: string }> = [];
  if (input.typeName) fields.push({ label: '资源类型', value: String(input.typeName) });
  if (input.resourceName) fields.push({ label: '目标资源', value: String(input.resourceName) });
  if (input.name) fields.push({ label: '名称', value: String(input.name) });
  if (input.code) fields.push({ label: '编码', value: String(input.code) });
  if (input.unit) fields.push({ label: '单位', value: String(input.unit) });
  if (input.amount != null) fields.push({ label: '数量', value: String(input.amount) });
  if (input.count != null) fields.push({ label: '个数', value: String(input.count) });
  if (input.newName) fields.push({ label: '命名', value: String(input.newName) });
  if (input.reason) fields.push({ label: '事由', value: String(input.reason) });
  return {
    badge,
    title: String(input.typeName ?? input.name ?? '操作确认'),
    summary: p.title,
    fields,
  };
});
</script>

<template>
  <Drawer
    class="agent-dialog"
    :open="open"
    title="AI 助手"
    direction="bottom"
    size="min(72vh, 480px)"
    :closable="phase === 'done'"
    :mask-closable="phase === 'done'"
    :esc-closable="phase === 'done'"
    @update:open="(v: boolean) => { if (!v) emit('close'); }"
  >
    <!-- 阶段指示 -->
    <div class="agent-dialog__phase">
      <span v-if="busy" class="agent-dialog__spinner" aria-hidden="true" />
      <span>{{ phaseLabel }}</span>
    </div>

    <!-- 过程日志：AI 思考与工具调用进展 -->
    <div ref="logRef" class="agent-dialog__log">
      <p v-if="activity.length === 0" class="agent-dialog__log-empty">正在解析指令…</p>
      <template v-for="item in activity" :key="item.id">
        <p v-if="item.kind === 'thought'" class="agent-dialog__thought">{{ item.text }}</p>
        <div v-else class="agent-dialog__tool">
          <span class="agent-dialog__tool-dot" :data-state="item.state" aria-hidden="true" />
          <span class="agent-dialog__tool-name">{{ item.text }}</span>
          <span v-if="item.detail" class="agent-dialog__tool-detail">{{ item.detail }}</span>
        </div>
      </template>
    </div>

    <!-- 操作卡片：写操作经用户确认后才执行 -->
    <div v-if="phase === 'confirming' && opCard" class="agent-dialog__op">
      <div class="agent-dialog__op-head">
        <span class="agent-dialog__badge" :data-tone="opCard.badge.tone">{{ opCard.badge.label }}</span>
        <span class="agent-dialog__op-title">{{ opCard.title }}</span>
        <span v-if="pendingTotal > 1" class="agent-dialog__op-index">第 1 / {{ pendingTotal }} 项</span>
      </div>
      <p class="agent-dialog__op-summary">{{ opCard.summary }}</p>
      <dl v-if="opCard.fields.length" class="agent-dialog__op-fields">
        <div v-for="f in opCard.fields" :key="f.label" class="agent-dialog__op-field">
          <dt>{{ f.label }}</dt>
          <dd>{{ f.value }}</dd>
        </div>
      </dl>
    </div>

    <!-- 结果区：模型最终回复（或错误）持久展示 -->
    <div v-if="phase === 'done'" class="agent-dialog__result" :data-error="!!lastError">
      {{ lastError || finalText || '未产生回复' }}
    </div>

    <!-- footer：确认阶段给裁决按钮，完成阶段给关闭按钮 -->
    <template #footer>
      <template v-if="phase === 'confirming'">
        <Button type="secondary" @click="emit('cancel')">取消</Button>
        <Button type="primary" @click="emit('confirm')">执行</Button>
      </template>
      <Button v-else-if="phase === 'done'" type="primary" @click="emit('close')">关闭</Button>
    </template>
  </Drawer>
</template>
