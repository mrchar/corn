"use client";

import { useEffect, useState } from "react";
import { createCornClient, type Quota, type Record } from "@corn/sdk";

export default function RecordsPage() {
  const [items, setItems] = useState<Record[]>([]);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [quotaId, setQuotaId] = useState<number>(0);
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const c = createCornClient();
      const [r, q] = await Promise.all([c.listRecords(), c.listQuotas()]);
      setItems(r);
      setQuotas(q);
      if (!quotaId && q[0]) setQuotaId(q[0].id);
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
      await createCornClient().createRecord({ quota_id: quotaId, amount: Number(amount) });
      setAmount("");
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>消耗记录</h1>
      <p className="muted">手动记录资源消耗；超出配额余额时后端将拒绝创建。</p>

      <form className="card row" onSubmit={create}>
        <select value={quotaId} onChange={(e) => setQuotaId(Number(e.target.value))}>
          {quotas.map((q) => (
            <option key={q.id} value={q.id}>
              配额 #{q.id}
            </option>
          ))}
        </select>
        <input placeholder="消耗金额" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button disabled={loading || !amount || !quotaId}>记录消耗</button>
      </form>

      {err && <div className="error">{err}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>配额</th>
              <th>金额</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.quota_id}</td>
                <td>{r.amount}</td>
                <td className="muted">{r.created ?? "-"}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  暂无消耗记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
