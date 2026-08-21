import { describe, it, expect, vi, beforeEach } from "vitest";

// mock next/link：避免 jsdom 下缺失 Next 上下文。
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

const mockListSpaces = vi.fn();
const mockCreateSpace = vi.fn();

vi.mock("@corn/sdk", () => ({
  __esModule: true,
  createCornClient: () => ({
    listSpaces: mockListSpaces,
    createSpace: mockCreateSpace,
  }),
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SpacesPage from "./page";

beforeEach(() => {
  mockListSpaces.mockReset();
  mockCreateSpace.mockReset();
});

describe("SpacesPage", () => {
  it("加载并渲染空间列表", async () => {
    mockListSpaces.mockResolvedValue([
      {
        id: 1,
        tenant_id: 1,
        code: "study",
        name: "学习",
        created: "2026-01-01T00:00:00Z",
      },
    ]);
    render(<SpacesPage />);

    await waitFor(() => expect(screen.getByText("study")).toBeInTheDocument());
    expect(screen.getByText("学习")).toBeInTheDocument();
    expect(screen.getByText("2026-01-01T00:00:00Z")).toBeInTheDocument();
  });

  it("空列表显示占位文案", async () => {
    mockListSpaces.mockResolvedValue([]);
    render(<SpacesPage />);
    await waitFor(() => expect(screen.getByText("暂无空间")).toBeInTheDocument());
  });

  it("加载失败显示错误信息", async () => {
    mockListSpaces.mockRejectedValue(new Error("网络错误"));
    render(<SpacesPage />);
    await waitFor(() => expect(screen.getByText("网络错误")).toBeInTheDocument());
  });

  it("输入 code 与名称后可创建空间并刷新列表", async () => {
    // 首次加载返回空，createSpace 后再次返回新增
    mockListSpaces.mockResolvedValueOnce([]);
    mockCreateSpace.mockResolvedValue({ id: 2, code: "work", name: "工作" });
    mockListSpaces.mockResolvedValueOnce([{ id: 2, code: "work", name: "工作" }]);

    render(<SpacesPage />);
    await waitFor(() => expect(screen.getByText("暂无空间")).toBeInTheDocument());

    const codeInput = screen.getByPlaceholderText(/code/);
    const nameInput = screen.getByPlaceholderText(/名称/);
    const button = screen.getByRole("button", { name: "创建空间" });

    // 按钮初始禁用
    expect(button).toBeDisabled();

    fireEvent.change(codeInput, { target: { value: "work" } });
    fireEvent.change(nameInput, { target: { value: "工作" } });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    await waitFor(() => expect(mockCreateSpace).toHaveBeenCalledWith({
      code: "work",
      name: "工作",
    }));
    await waitFor(() => expect(screen.getByText("工作")).toBeInTheDocument());
  });

  it("创建失败显示错误信息且不调用刷新", async () => {
    mockListSpaces.mockResolvedValueOnce([]);
    mockCreateSpace.mockRejectedValue(new Error("冲突"));

    render(<SpacesPage />);
    await waitFor(() => expect(screen.getByText("暂无空间")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/code/), {
      target: { value: "x" },
    });
    fireEvent.change(screen.getByPlaceholderText(/名称/), {
      target: { value: "X" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建空间" }));

    await waitFor(() => expect(screen.getByText("冲突")).toBeInTheDocument());
    // createSpace 只应被调用一次（失败后不再刷新）
    expect(mockCreateSpace).toHaveBeenCalledTimes(1);
  });
});
