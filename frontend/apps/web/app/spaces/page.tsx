"use client";

import { useEffect, useState } from "react";
import { createCornClient, type Space } from "@corn/sdk";

export default function SpacesPage() {
  const [items, setItems] = useState<Space[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setItems(await createCornClient().listSpaces());
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await createCornClient().createSpace({ code, name });
      setCode("");
      setName("");
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>活动空间</h1>
      <p className="muted">互斥独立的活动容器（如学习 / 工作），各自独立预算。</p>

      <form className="card row" onSubmit={create}>
        <input placeholder="code（如 study）" value={code} onChange={(e) => setCode(e.target.value)} />
        <input placeholder="名称（如 学习）" value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={loading || !code || !name}>创建空间</button>
      </form>

      {err && <div className="error">{err}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>code</th>
              <th>名称</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.code}</td>
                <td>{s.name}</td>
                <td className="muted">{s.created ?? "-"}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  暂无空间
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
