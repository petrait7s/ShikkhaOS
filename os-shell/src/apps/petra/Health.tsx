"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTip, XAxis, YAxis } from "recharts";
import { usePlatformQ } from "@/api/hooks";
import { ErrorBox, SkeletonRows } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function Health() {
  const { t, n } = useT();
  const { metrics } = usePlatformQ();
  if (metrics.isLoading) return <SkeletonRows rows={6} />;
  if (metrics.isError) return <ErrorBox error={metrics.error} retry={() => void metrics.refetch()} />;
  const d = metrics.data ?? [];
  const last = d.at(-1);
  const avg = (k: "uptime" | "errorRate" | "latency") => (d.length ? d.reduce((s, x) => s + x[k], 0) / d.length : 0);
  const tiles: [string, string][] = [[t("health.uptime"), `${n(avg("uptime").toFixed(2))}%`], [t("health.errorrate"), `${n(avg("errorRate").toFixed(2))}%`], [t("health.latency"), `${n(Math.round(avg("latency")))} ms`], [t("health.today"), last ? `${n(last.latency)} ms` : "—"]];
  return (
    <div className="grid gap-4 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{tiles.map(([l, v]) => <div key={l} className="card p-4"><div className="faint text-[11px] font-bold uppercase tracking-wider">{l}</div><div className="mt-1 text-2xl font-extrabold">{v}</div></div>)}</div>
      <section className="card p-4">
        <h3 className="faint mb-2 text-[11px] font-bold uppercase tracking-wider">{t("health.latency")} · 30d</h3>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={d} margin={{ left: -10, right: 8, top: 6 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(v: string) => v.slice(5)} tick={{ fontSize: 11, fill: "var(--ink-2)" }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: "var(--ink-2)" }} />
              <RTip contentStyle={{ background: "var(--card-solid)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }} />
              <Area type="monotone" dataKey="latency" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.18} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
