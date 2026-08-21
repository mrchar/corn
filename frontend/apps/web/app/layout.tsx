import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "玉米 CORN · 资源管理",
  description: "预算 · 配额 · 消耗 —— 通用资源管理系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="layout">
          <nav className="nav">
            <Link href="/" className="brand">
              玉米 CORN
            </Link>
            <Link href="/spaces">空间</Link>
            <Link href="/budgets">预算</Link>
            <Link href="/actions">活动</Link>
            <Link href="/quotas">配额</Link>
            <Link href="/records">消耗</Link>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
