"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTip, XAxis, YAxis } from "recharts";
import { usePlatformQ } from "@/api/hooks";
import { ErrorBox, SkeletonRows } from "@/components/ui";
import { useT } from "@/lib/i18n";

const tip = { contentStyle: { background: "var(--card-solid)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 } };
const axis = { fontSize: 11, fill: "var(--ink-2)" };

export default function Usage() {
  const { t } = useT();
  const { metrics } = usePlatformQ();
  if (metrics.isLoading) return <SkeletonRows rows={6} />;
  if (metrics.isError) return <ErrorBox error={metrics.error} retry={() => void metrics.refetch()} />;
  const d = metrics.data ?? [];
  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="card p-4"><h3 className="faint mb-2 text-[11px] font-bold uppercase tracking-wider">{title}</h3><div style={{ height: 190 }}>{children}</div></section>;
  return (
    <div className="grid gap-4 p-4">
      <Card title={t("usage.dau")}><ResponsiveContainer width="100%" height="100%"><LineChart data={d} margin={{ left: -10, right: 8 }}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="day" tickFormatter={(v: string) => v.slice(5)} tick={axis} minTickGap={24} /><YAxis tick={axis} /><RTip {...tip} /><Line type="monotone" dataKey="dau" stroke="var(--accent)" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t("usage.published")}><ResponsiveContainer width="100%" height="100%"><BarChart data={d} margin={{ left: -10, right: 8 }}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="day" tickFormatter={(v: string) => v.slice(8)} tick={axis} minTickGap={12} /><YAxis tick={axis} allowDecimals={false} /><RTip {...tip} /><Bar dataKey="published" fill="var(--accent)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Card>
        <Card title={t("usage.uploads")}><ResponsiveContainer width="100%" height="100%"><BarChart data={d} margin={{ left: -10, right: 8 }}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="day" tickFormatter={(v: string) => v.slice(8)} tick={axis} minTickGap={12} /><YAxis tick={axis} allowDecimals={false} /><RTip {...tip} /><Bar dataKey="uploads" fill="var(--accent)" fillOpacity={0.7} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Card>
      </div>
    </div>
  );
}
