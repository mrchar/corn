"use client";

import { useEffect, useState } from "react";
import { createCornClient, type Budget, type Action, type Quota, type QuotaBalance } from "@corn/sdk";

export default function QuotasPage() {
  const [items, setItems] = useState<Quota[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [balances, setBalances] = useState<Record<number, QuotaBalance>>({});
  const [budgetId, setBudgetId] = useState<number>(0);
  const [actionId, setActionId] = useState<number>(0);
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const c = createCornClient();
      const [q, b, a] = await Promise.all([c.listQuotas(), c.listBudgets(), c.listActions()]);
      setItems(q);
      setBudgets(b);
      setActions(a);
      if (!budgetId && b[0]) setBudgetId(b[0].id);
      if (!actionId && a[0]) setActionId(a[0].id);
      // 并发拉取每个配额的余额
      const bal: Record<number, QuotaBalance> = {};
      await Promise.all(
        q.map(async (it) => {
          try {
            bal[it.id] = await c.quotaBalance(it.id);
          } catch {
            /* ignore */
          }
        }),
      );
      setBalances(bal);
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
      await createCornClient().createQuota({
        budget_id: budgetId,
        action_id: actionId,
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

  return (
    <div>
      <h1>配额</h1>
      <p className="muted">将预算金额划分给具体活动；余额 = 配额金额 − 已消耗。</p>

      <form className="card row" onSubmit={create}>
        <select value={budgetId} onChange={(e) => setBudgetId(Number(e.target.value))}>
          {budgets.map((b) => (
            <option key={b.id} value={b.id}>
              预算 #{b.id}
            </option>
          ))}
        </select>
        <select value={actionId} onChange={(e) => setActionId(Number(e.target.value))}>
          {actions.map((a) => (
            <option key={a.id} value={a.id}>
              活动：{a.name}
            </option>
          ))}
        </select>
        <input placeholder="金额" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button disabled={loading || !amount || !budgetId || !actionId}>创建配额</button>
      </form>

      {err && <div className="error">{err}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>预算</th>
              <th>活动</th>
              <th>配额</th>
              <th>已消耗</th>
              <th>余额</th>
            </tr>
          </thead>
          <tbody>
            {items.map((q) => {
              const bal = balances[q.id];
              return (
                <tr key={q.id}>
                  <td>{q.id}</td>
                  <td>{q.budget_id}</td>
                  <td>{q.action_id}</td>
                  <td>{q.amount}</td>
                  <td>{bal ? bal.consumed.toFixed(2) : "-"}</td>
                  <td>{bal ? bal.balance.toFixed(2) : "-"}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  暂无配额
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
