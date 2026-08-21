"use client";

import { useEffect, useState } from "react";
import { createCornClient, type Action, type Space } from "@corn/sdk";

export default function ActionsPage() {
  const [items, setItems] = useState<Action[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceId, setSpaceId] = useState<number>(0);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const c = createCornClient();
      const [a, s] = await Promise.all([c.listActions(), c.listSpaces()]);
      setItems(a);
      setSpaces(s);
      if (!spaceId && s[0]) setSpaceId(s[0].id);
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
      await createCornClient().createAction({
        space_id: spaceId,
        parent_id: parentId ? Number(parentId) : null,
        name,
      });
      setName("");
      setParentId("");
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  const spaceName = (id: number) => spaces.find((s) => s.id === id)?.name ?? id;
  const actionName = (id: number | null) => (id ? items.find((a) => a.id === id)?.name ?? id : "-");

  return (
    <div>
      <h1>活动</h1>
      <p className="muted">支持父子层级；子活动配额之和 ≤ 父活动配额。</p>

      <form className="card row" onSubmit={create}>
        <select value={spaceId} onChange={(e) => setSpaceId(Number(e.target.value))}>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              空间：{s.name}
            </option>
          ))}
        </select>
        <input placeholder="活动名称" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="父活动 ID（可选）" value={parentId} onChange={(e) => setParentId(e.target.value)} />
        <button disabled={loading || !name || !spaceId}>创建活动</button>
      </form>

      {err && <div className="error">{err}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>空间</th>
              <th>名称</th>
              <th>父活动</th>
              <th>标签</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td>{a.id}</td>
                <td>{spaceName(a.space_id)}</td>
                <td>{a.name}</td>
                <td className="muted">{actionName(a.parent_id)}</td>
                <td>
                  {a.labels.map((l) => (
                    <span key={l.key} className="badge" style={{ marginRight: 4 }}>
                      {l.key}={l.value}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  暂无活动
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
