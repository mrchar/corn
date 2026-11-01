<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { components, composables } from '@mrchar/cumquat';
import type { ChatInputPayload, VoiceRecognizer } from '@mrchar/cumquat/composables';
import { currentView } from '../store/app';
import { createRemoteRecognizer, createSimulatedRecognizer, fetchAsrConfigured } from '../services/asr';
import { useAgentChat } from '../services/agent';
import AgentDialog from './AgentDialog.vue';

const { ChatInput } = components;
const { message, useMediaQuery } = composables;

/** 视窗分支：桌面 sticky 悬浮条 / 手机 fixed 底条（与 AppLayout 同断点直查，响应式自动同步） */
const isMobile = useMediaQuery('(max-width: 767px)');

/* ---------- 语音识别：远程（豆包）优先，未配置/断连降级仿真 ----------
 * 两类识别器共享同一组 transcript/level 响应式对象，ChatInput 绑定的引用保持稳定；
 * 后端配置探测一次缓存，探测未返回前先走仿真避免等待。
 */
const transcript = ref('');
const level = ref(0);
const asrConfigured = ref<boolean | null>(null);
let fallbackNotified = false;

function onRecognizerError(text: string, code?: string) {
  if (code === 'ASR_NOT_CONFIGURED') asrConfigured.value = false;
  message.error(text);
}

const simulated = createSimulatedRecognizer({ transcript, level, onError: onRecognizerError });
const remote = createRemoteRecognizer({ transcript, level, onError: onRecognizerError });

onMounted(async () => {
  try {
    asrConfigured.value = await fetchAsrConfigured();
  } catch {
    asrConfigured.value = false;
  }
});

const recognizer: VoiceRecognizer = {
  transcript,
  level,
  start() {
    if (asrConfigured.value) {
      remote.start();
      return;
    }
    simulated.start();
    if (asrConfigured.value === false && !fallbackNotified) {
      fallbackNotified = true;
      message.info('未配置豆包语音识别，当前为仿真演示');
    }
  },
  stop() {
    (asrConfigured.value ? remote : simulated).stop();
  },
  reset() {
    simulated.reset();
    remote.reset();
    transcript.value = '';
    level.value = 0;
  },
};

onBeforeUnmount(() => {
  simulated.reset();
  remote.reset();
});

/* ---------- 智能体管道：网关可用时由 LLM 解析指令并调用工具，写操作经确认卡片裁决 ---------- */
const {
  configured: agentConfigured,
  pending: pendingConfirm,
  pendingTotal,
  resolvePending,
  agentActive,
  phase,
  activity,
  finalText,
  lastError,
  send: agentSend,
  close: agentClose,
} = useAgentChat();

/* ---------- P1 轻指令降级：导航直执行，业务指令提示待接入（网关未配置时的兜底） ---------- */
const NAV_VIEWS = [
  { pattern: /打开资源池|去资源池|切换到资源池/, view: 'pool', name: '资源池' },
  { pattern: /打开资源类型|去资源类型|切换到资源类型/, view: 'types', name: '资源类型' },
  { pattern: /打开组织|去组织|切换到组织/, view: 'org', name: '组织' },
] as const;

function submitCommand(raw: string) {
  const text = raw.trim();
  if (!text) return;
  // 网关已配置：交给智能体解析与执行（错误经 useAgentChat 内部提示）
  if (agentConfigured.value) {
    agentSend(text);
    return;
  }
  // 降级：本地规则
  const hit = NAV_VIEWS.find((n) => n.pattern.test(text));
  if (hit) {
    currentView.value = hit.view;
    message.success(`已切换到${hit.name}`);
    return;
  }
  message.info(`已收到指令「${text}」，执行能力将在下一步接入`);
}

/** 发送协议：成功 resolve 清空草稿，失败抛错保留草稿并展示错误条（P2 写操作接入重试语义） */
async function onAction(payload: ChatInputPayload) {
  submitCommand(payload.text);
}

/** 快捷指令：聚焦输入框时浮现；run 直接执行，fill 填入草稿供确认修改（发送键随之出现） */
const quickChips = [
  { label: '打开资源池', mode: 'run' },
  { label: '打开资源类型', mode: 'run' },
  { label: '打开组织', mode: 'run' },
  { label: '创建 10 个金币', mode: 'fill' },
] as const;

const focused = ref(false);

/** 非受控模式：受控 v-model 下语音键 confirm 的「写入草稿→立即发送」同段执行，canSend 读到滞后外部值会误拦发送（0.3.1 边界缺陷），经组件实例 ref 写入草稿规避 */
const chatRef = ref<{ input: { draft: { value: string } } } | null>(null);

function onChip(chip: (typeof quickChips)[number]) {
  if (chip.mode === 'run') {
    submitCommand(chip.label);
  } else if (chatRef.value) {
    chatRef.value.input.draft.value = chip.label;
  }
}
</script>

<template>
  <div
    class="command-bar"
    :class="isMobile ? 'command-bar--mobile' : 'command-bar--desktop'"
    @focusin="focused = true"
    @focusout="focused = false"
  >
    <div v-if="focused" class="command-bar__chips">
      <button
        v-for="chip in quickChips"
        :key="chip.label"
        type="button"
        class="command-bar__chip"
        @pointerdown.prevent
        @click="onChip(chip)"
      >
        {{ chip.label }}
      </button>
    </div>
    <ChatInput
      ref="chatRef"
      class="command-bar__chat"
      :voice="recognizer"
      placeholder="按住说话，或输入指令"
      :action="onAction"
    />
    <!-- 全程弹窗：思考 → 工具调用进展 → 操作卡片确认 → 执行结果 -->
    <AgentDialog
      :open="agentActive"
      :phase="phase"
      :activity="activity"
      :pending="pendingConfirm"
      :pending-total="pendingTotal"
      :final-text="finalText"
      :last-error="lastError"
      @confirm="resolvePending(true)"
      @cancel="resolvePending(false)"
      @close="agentClose"
    />
  </div>
</template>
