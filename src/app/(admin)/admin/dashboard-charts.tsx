"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { formatCurrency } from "@/lib/formatters";

const PIE_COLORS = ["oklch(0.55 0.2 264)", "oklch(0.65 0.18 160)", "oklch(0.7 0.15 50)", "oklch(0.6 0.2 300)"];

export function MonthlyBarChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.005 260)" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v > 1000000 ? `${(v / 1000000).toFixed(0)}M` : v > 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: "0.75rem", fontSize: "13px" }} />
        <Bar dataKey="ventas" name="Ventas" fill="oklch(0.55 0.2 264)" radius={[6, 6, 0, 0]} />
        <Bar dataKey="egresos" name="Egresos" fill="oklch(0.65 0.18 160)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PaymentPieChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <PieChart>
        <Pie data={data} innerRadius={50} outerRadius={75} dataKey="value" stroke="none">
          {data.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
        </Pie>
        <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: "0.75rem", fontSize: "13px" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export { PIE_COLORS };
