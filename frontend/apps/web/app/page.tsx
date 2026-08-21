import Link from "next/link";

export default function HomePage() {
  return (
    <div>
      <h1>玉米 CORN</h1>
      <p className="muted">
        简易通用资源管理系统 —— 通过「预算 → 配额 → 消耗记录」对任意活动中的时间、人力、资金等成本进行计划、分配与追踪。
      </p>

      <div className="grid3" style={{ marginTop: 24 }}>
        <div className="card">
          <h2>统一逻辑内核</h2>
          <p className="muted">Rust `corn-core` 业务逻辑，SaaS、私有化、本地独立运行三种部署形态共享同一份代码。</p>
        </div>
        <div className="card">
          <h2>契约驱动</h2>
          <p className="muted">utoipa 自动产出 OpenAPI 3.1，前端通过 `@corn/sdk` 统一复用类型与调用。</p>
        </div>
        <div className="card">
          <h2>多端入口</h2>
          <p className="muted">Web（Next.js）、移动（React Native）、桌面 / 本地（Tauri）共用一套 SDK。</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>开始使用</h2>
        <p>
          先启动后端：<code>cd /workspace &amp;&amp; cargo run -p corn-server</code>，随后在
          <Link href="/spaces"> 空间管理 </Link>
          开始创建你的第一个活动空间与预算。
        </p>
        <p className="muted">Swagger UI：<code>http://localhost:8080/swagger-ui</code></p>
      </div>
    </div>
  );
}
