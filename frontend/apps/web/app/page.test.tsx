import { describe, it, expect, vi } from "vitest";

// next/link 在 jsdom 下需要 mock，否则会因 next 上下文缺失抛错。
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("渲染主标题与项目介绍", () => {
    render(<HomePage />);
    expect(screen.getByText("玉米 CORN")).toBeInTheDocument();
    expect(screen.getByText(/统一逻辑内核/)).toBeInTheDocument();
  });

  it("渲染三张特性卡片", () => {
    render(<HomePage />);
    expect(screen.getByText("统一逻辑内核")).toBeInTheDocument();
    expect(screen.getByText("契约驱动")).toBeInTheDocument();
    expect(screen.getByText("多端入口")).toBeInTheDocument();
  });

  it("渲染开始使用卡片与导航链接", () => {
    render(<HomePage />);
    expect(screen.getByText("开始使用")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /空间管理/ });
    expect(link).toHaveAttribute("href", "/spaces");
  });

  it("提示 Swagger UI 地址", () => {
    render(<HomePage />);
    expect(screen.getByText(/swagger-ui/)).toBeInTheDocument();
  });
});
