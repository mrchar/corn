import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 每个用例结束后清理 DOM，避免跨用例渲染泄漏导致 "multiple elements" 错误。
afterEach(() => {
  cleanup();
});

// 在 jsdom 中，fetch / Response 默认未实现，提供最小 mock 供测试覆盖。
type FetchCall = (input: string, init?: RequestInit) => Promise<Response>;
let currentFetch: FetchCall = async () =>
  Promise.resolve(
    new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

export function setFetch(impl: FetchCall) {
  currentFetch = impl;
}

(globalThis as unknown as { __setFetch: typeof setFetch }).__setFetch = setFetch;
(globalThis as unknown as { fetch: FetchCall }).fetch = ((
  input: string,
  init?: RequestInit,
) => currentFetch(input, init)) as typeof fetch;
