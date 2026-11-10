import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';

/** 品牌色（低彩度）：以直接標籤＋表格檢視作為輔助辨識，不單靠顏色 */
export const C = {
  pine: '#284A45',
  pineHover: '#335C56',
  gold: '#9A7B4E',
  sage: '#A8BCAF',
  grid: '#ECE8DF',
  axis: '#6F7678',
  muted: '#D3DED6',
};

const axisProps = { tick: { fill: C.axis, fontSize: 12 }, axisLine: false, tickLine: false } as const;

function TooltipBox({ active, payload, label, fmt, labelFmt }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: ReactNode; fmt?: (key: string, v: number) => string; labelFmt?: (l: unknown) => string }) {
  if (!active || !payload?.length) return null;
  label = labelFmt ? labelFmt(label) : label;
  return (
    <div className="rounded-[12px] border border-line bg-white px-3 py-2 text-[13px] shadow-lift">
      <div className="mb-1 text-ink-3">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded" style={{ background: p.color }} />
          <span className="num text-[15px] font-semibold text-ink">{fmt ? fmt(p.dataKey, p.value) : p.value}</span>
          <span className="text-ink-3">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** 月度直條（單位相同的序列可並列；不同單位請用兩張圖） */
export function MonthlyBars<T extends { month: number }>({ data, series, height = 240, onSelect, selected, fmt }: {
  data: T[];
  series: { key: keyof T & string; label: string; color: string }[];
  height?: number;
  onSelect?: (month: number) => void;
  selected?: number;
  fmt?: (key: string, v: number) => string;
}) {
  const reduce = useReducedMotion();
  return (
    <div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 18, right: 4, left: -18, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="month" tickFormatter={(m) => `${m}月`} {...axisProps} interval={0} />
          <YAxis allowDecimals={false} {...axisProps} width={44} />
          <Tooltip cursor={{ fill: 'rgba(168,188,175,0.18)' }} content={<TooltipBox fmt={fmt} labelFmt={(m) => `${m} 月`} />} />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key as string}
              name={s.label}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={!reduce}
              animationDuration={600}
              onClick={(d) => onSelect?.((d as unknown as { month: number }).month)}
              cursor={onSelect ? 'pointer' : undefined}
            >
              {data.map((row) => (
                <Cell key={row.month} fillOpacity={selected && selected !== row.month ? 0.35 : 1} />
              ))}
              {series.length === 1 && <LabelList dataKey={s.key} position="top" fontSize={11} fill={C.axis} formatter={(v: unknown) => (Number(v) ? (fmt ? fmt(s.key, Number(v)) : String(v)) : '')} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 水平排行長條 */
export function RankBars<T extends { key: string; label: string }>({ rows, valueKey, fmt, unit, onSelect, selected, color = C.pine, max = 12 }: {
  rows: T[];
  valueKey: keyof T & string;
  fmt?: (v: number) => string;
  unit: string;
  onSelect?: (key: string) => void;
  selected?: string;
  color?: string;
  max?: number;
}) {
  const reduce = useReducedMotion();
  const shown = [...rows].sort((a, b) => Number(b[valueKey]) - Number(a[valueKey])).slice(0, max);
  const rest = rows.length - shown.length;
  const h = Math.max(120, shown.length * 30 + 20);
  const labelW = Math.min(140, Math.max(64, Math.max(...shown.map((r) => r.label.length), 2) * 14 + 8));
  return (
    <div>
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={shown} layout="vertical" margin={{ top: 4, right: 52, left: 0, bottom: 4 }} barCategoryGap={6}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={labelW} {...axisProps} tick={{ fill: '#252B2D', fontSize: 13 }} />
          <Tooltip cursor={{ fill: 'rgba(168,188,175,0.18)' }} content={<TooltipBox fmt={(_, v) => `${fmt ? fmt(v) : v} ${unit}`} />} />
          <Bar dataKey={valueKey as string} name={unit} fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={!reduce} animationDuration={600} onClick={(d) => onSelect?.((d as unknown as T).key)} cursor={onSelect ? 'pointer' : undefined}>
            {shown.map((r) => (
              <Cell key={r.key} fillOpacity={selected && selected !== r.key ? 0.35 : 1} />
            ))}
            <LabelList dataKey={valueKey} position="right" fontSize={12} fill="#252B2D" formatter={(v: unknown) => (fmt ? fmt(Number(v)) : String(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {rest > 0 && <div className="mt-1 text-[12px] text-ink-3">另有 {rest} 項未顯示，請見下方表格</div>}
    </div>
  );
}

export function TrendLine<T>({ data, xKey, yKey, label, fmt, height = 180, xFmt }: { data: T[]; xKey: keyof T & string; yKey: keyof T & string; label: string; fmt?: (v: number) => string; height?: number; xFmt?: (v: unknown) => string }) {
  const reduce = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 16, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey={xKey as string} {...axisProps} tickFormatter={xFmt} />
        <YAxis {...axisProps} width={44} tickFormatter={(v) => (fmt ? fmt(v) : v)} />
        <Tooltip content={<TooltipBox fmt={(_, v) => (fmt ? fmt(v) : String(v))} labelFmt={(v) => (xFmt ? xFmt(v) : String(v))} />} />
        <Line type="monotone" dataKey={yKey as string} name={label} stroke={C.pine} strokeWidth={2} dot={{ r: 4, fill: C.pine, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={!reduce} />
      </LineChart>
    </ResponsiveContainer>
  );
}
