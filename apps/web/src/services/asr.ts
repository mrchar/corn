import { ref, type Ref } from 'vue';
import type { VoiceRecognizer } from '@mrchar/cumquat/composables';

/**
 * 语音识别器工厂：
 * - 远程识别器：麦克风 16kHz 16bit 单声道 PCM → 后端 /ws/asr → 豆包流式识别；
 * - 仿真识别器：无 key / 探测失败时的降级演示。
 * 两类识别器共享同一组 transcript/level 响应式对象，ChatInput 绑定的引用保持稳定。
 */

export interface RecognizerDeps {
  transcript: Ref<string>;
  level: Ref<number>;
  onError(message: string, code?: string): void;
}

/** 探测后端是否已配置豆包语音识别 */
export async function fetchAsrConfigured(): Promise<boolean> {
  const res = await fetch('/asr/status');
  if (!res.ok) throw new Error(`asr/status ${res.status}`);
  const body = (await res.json()) as { configured?: boolean };
  return body.configured === true;
}

/** 仿真识别器：140ms/字逐字转写演示句 + 随机音量驱动声波条 */
export function createSimulatedRecognizer({ transcript, level }: RecognizerDeps): VoiceRecognizer {
  const DEMO_SENTENCE = '打开资源池';
  let typeTimer: ReturnType<typeof setInterval> | null = null;
  let levelTimer: ReturnType<typeof setInterval> | null = null;

  function stopTimers(): void {
    if (typeTimer !== null) {
      clearInterval(typeTimer);
      typeTimer = null;
    }
    if (levelTimer !== null) {
      clearInterval(levelTimer);
      levelTimer = null;
    }
  }

  return {
    transcript,
    level,
    start() {
      stopTimers();
      let typed = 0;
      typeTimer = setInterval(() => {
        typed += 1;
        transcript.value = DEMO_SENTENCE.slice(0, typed);
        if (typed >= DEMO_SENTENCE.length && typeTimer !== null) {
          clearInterval(typeTimer);
          typeTimer = null;
        }
      }, 140);
      levelTimer = setInterval(() => {
        level.value = 0.3 + Math.random() * 0.55;
      }, 130);
    },
    stop() {
      stopTimers();
    },
    reset() {
      stopTimers();
      transcript.value = '';
    },
  };
}

/** 远程识别器：走后端 WS 网关的豆包流式识别 */
export function createRemoteRecognizer({ transcript, level, onError }: RecognizerDeps): VoiceRecognizer {
  const ASR_WS_URL = `${location.protocol.replace('http', 'ws')}//${location.host}/ws/asr`;
  let ws: WebSocket | null = null;
  let capture: { stop(): void } | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  function closeSocket(): void {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    if (ws) {
      const socket = ws;
      ws = null;
      try {
        socket.close();
      } catch {
        /* noop */
      }
    }
  }

  /** 采集麦克风：AudioContext 输出 16kHz，ScriptProcessor 每 2048 采样（128ms）出一包 */
  async function beginCapture(socket: WebSocket): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const ctx = new AudioContext({ sampleRate: 16000 });
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0; // 仅驱动处理回调，不外放
      source.connect(processor);
      processor.connect(mute);
      mute.connect(ctx.destination);
      processor.onaudioprocess = (e) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        let sumSq = 0;
        for (let i = 0; i < input.length; i += 1) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          sumSq += s * s;
        }
        level.value = Math.min(1, Math.sqrt(sumSq / input.length) * 4);
        socket.send(pcm.buffer);
      };
      capture = {
        stop() {
          processor.onaudioprocess = null;
          source.disconnect();
          processor.disconnect();
          mute.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
        },
      };
    } catch {
      onError('无法访问麦克风，请检查浏览器权限');
      socket.close();
    }
  }

  return {
    transcript,
    level,
    start() {
      closeSocket();
      if (capture) {
        capture.stop();
        capture = null;
      }
      transcript.value = '';
      let socket: WebSocket;
      try {
        socket = new WebSocket(ASR_WS_URL);
      } catch {
        onError('语音识别服务地址非法');
        return;
      }
      ws = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'start' }));
        void beginCapture(socket);
      };
      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type: string; text?: string; message?: string; code?: string };
          if (msg.type === 'partial' || msg.type === 'final') {
            transcript.value = msg.text ?? '';
          } else if (msg.type === 'error') {
            onError(msg.message ?? '语音识别服务错误', msg.code);
          }
        } catch {
          /* 忽略非 JSON 帧 */
        }
      };
      socket.onerror = () => {
        onError('无法连接语音识别服务');
      };
      socket.onclose = () => {
        if (ws === socket) ws = null;
      };
    },
    stop() {
      if (capture) {
        capture.stop();
        capture = null;
      }
      level.value = 0;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
      }
      // 保留连接 3s 等待豆包尾包定稿，随后清理
      closeTimer = setTimeout(closeSocket, 3000);
    },
    reset() {
      if (capture) {
        capture.stop();
        capture = null;
      }
      closeSocket();
      transcript.value = '';
      level.value = 0;
    },
  };
}
