"use client";

import { useEffect, useState } from "react";
import { createCornClient, type Budget, type Category, type Space } from "@corn/sdk";

export default function BudgetsPage() {
  const [items, setItems] = useState<Budget[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [spaceId, setSpaceId] = useState<number>(0);
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const c = createCornClient();
      const [b, s, cat] = await Promise.all([c.listBudgets(), c.listSpaces(), c.listCategories()]);
      setItems(b);
      setSpaces(s);
      setCategories(cat);
      if (!spaceId && s[0]) setSpaceId(s[0].id);
      if (!categoryId && cat[0]) setCategoryId(cat[0].id);
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
      await createCornClient().createBudget({
        category_id: categoryId,
        space_id: spaceId,
        amount: Number(amount),
      });
      setAmount("");
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  const spaceName = (id: number) => spaces.find((s) => s.id === id)?.name ?? id;
  const categoryName = (id: number) => categories.find((c) => c.id === id)?.name ?? id;

  return (
    <div>
      <h1>预算</h1>
      <p className="muted">在空间内为某类别创建的资源总量计划。</p>

      <form className="card row" onSubmit={create}>
        <select value={spaceId} onChange={(e) => setSpaceId(Number(e.target.value))}>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              空间：{s.name}
            </option>
          ))}
        </select>
        <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              类别：{c.name}
            </option>
          ))}
        </select>
        <input placeholder="金额" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button disabled={loading || !amount || !spaceId || !categoryId}>创建预算</button>
      </form>

      {err && <div className="error">{err}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>空间</th>
              <th>类别</th>
              <th>金额</th>
              <th>标签</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id}>
                <td>{b.id}</td>
                <td>{spaceName(b.space_id)}</td>
                <td>{categoryName(b.category_id)}</td>
                <td>{b.amount}</td>
                <td>
                  {b.labels.map((l) => (
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
                  暂无预算
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
