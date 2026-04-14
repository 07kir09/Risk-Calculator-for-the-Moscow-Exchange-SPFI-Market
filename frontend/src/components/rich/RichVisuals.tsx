import { PropsWithChildren, ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Chip, ProgressCircle, Separator, Tooltip } from "@heroui/react";
import { motion, useInView } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

type PrimitiveDatum = {
  label: string;
  value: number;
  secondary?: number;
  tone?: "positive" | "negative" | "neutral";
};

type ChartCardProps = {
  title: string;
  subtitle?: string;
  endSlot?: ReactNode;
  children: ReactNode;
  className?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatTick(value: string | number) {
  if (typeof value === "number") {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
    return String(Math.round(value));
  }
  return value;
}

function formatCategoryTick(value: string | number) {
  const label = String(value ?? "");
  return label.length > 16 ? `${label.slice(0, 14)}…` : label;
}

function formatChartValue(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(Math.abs(value) < 10 ? 2 : 1);
}

function formatTooltipValue(value: unknown) {
  return formatChartValue(typeof value === "number" ? value : Number(value ?? 0));
}

const spring = { type: "spring", stiffness: 120, damping: 18, mass: 0.8 } as const;

const tooltipStyle = {
  contentStyle: {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(10,10,12,0.96)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    padding: "8px 12px",
    fontSize: 12,
  },
  labelStyle: { color: "rgba(244,241,234,0.58)", marginBottom: 4 },
};

export function Reveal({ children, className, delay = 0 }: PropsWithChildren<{ className?: string; delay?: number }>) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ ...spring, delay }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGroup({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: spring } }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView || !Number.isFinite(value)) {
      if (!Number.isFinite(value)) setDisplay(0);
      return;
    }
    let raf = 0;
    let frame = 0;
    const start = performance.now();
    const duration = 600;
    const to = value;

    const tick = (now: number) => {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(to * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    frame = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, 60);
    return () => { window.clearTimeout(frame); cancelAnimationFrame(raf); };
  }, [inView, value]);

  return (
    <div ref={ref} className={className}>
      {prefix}{display.toFixed(decimals)}{suffix}
    </div>
  );
}

export function ChartCard({ title, subtitle, endSlot, children, className }: ChartCardProps) {
  return (
    <div className={`richChartCard ${className ?? ""}`}>
      <div className="richChartCardHeader">
        <div>
          <div className="richChartTitle">{title}</div>
          {subtitle ? <div className="richChartSubtitle">{subtitle}</div> : null}
        </div>
        {endSlot}
      </div>
      <div className="richChartBody">{children}</div>
    </div>
  );
}

export function Sparkline({
  data,
  color = "#6eff8e",
  height = 72,
  className,
}: {
  data: PrimitiveDatum[];
  color?: string;
  height?: number;
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const safe = data.length
    ? data
    : [24, 28, 19, 36, 31].map((v, i) => ({ label: String(i + 1), value: v }));

  return (
    <div className={`sparklineWrap ${className ?? ""}`}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={safe}>
          <defs>
            <linearGradient id={`spark-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.38} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <RechartsTooltip cursor={false} {...tooltipStyle} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#spark-${gradientId})`}
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaTrendChart({
  data,
  color = "#6eff8e",
  accent = "#7da7ff",
  valueKey = "value",
  secondaryKey = "secondary",
  showSecondary = false,
  height = 220,
  yLabel,
}: {
  data: PrimitiveDatum[];
  color?: string;
  accent?: string;
  valueKey?: string;
  secondaryKey?: string;
  showSecondary?: boolean;
  height?: number;
  yLabel?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const safe = data.length
    ? data
    : [
        { label: "Mon", value: 12, secondary: 9 },
        { label: "Tue", value: 18, secondary: 13 },
        { label: "Wed", value: 15, secondary: 11 },
        { label: "Thu", value: 24, secondary: 17 },
        { label: "Fri", value: 19, secondary: 15 },
      ];

  const hasNegative = safe.some((d) => d.value < 0);

  return (
    <div className="trendChartWrap">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={safe}>
          <defs>
            <linearGradient id={`area-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.38} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={20}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.42)", fontSize: 11 }}
          />
          <YAxis
            tickFormatter={formatTick}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.42)", fontSize: 11 }}
            width={56}
            label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: "rgba(244,241,234,0.3)", fontSize: 10 } : undefined}
          />
          <RechartsTooltip
            {...tooltipStyle}
            formatter={(value, name) => [
              formatTooltipValue(value),
              name === secondaryKey ? "Лимит" : "P&L",
            ]}
          />
          {hasNegative && (
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.22)" strokeDasharray="5 4" strokeWidth={1.5} />
          )}
          <Area
            type="monotone"
            dataKey={valueKey}
            stroke={color}
            fill={`url(#area-${gradientId})`}
            strokeWidth={2.5}
            animationDuration={750}
            dot={false}
          />
          {showSecondary && (
            <Line
              type="monotone"
              dataKey={secondaryKey}
              stroke={accent}
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="6 4"
              animationDuration={800}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineTrendChart({
  data,
  color = "#7da7ff",
  secondaryColor = "#6eff8e",
  showSecondary = false,
  height = 220,
  primaryLabel = "Значение",
  secondaryLabel = "Лимит",
}: {
  data: PrimitiveDatum[];
  color?: string;
  secondaryColor?: string;
  showSecondary?: boolean;
  height?: number;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  const safe = data.length
    ? data
    : [
        { label: "T-5", value: 48, secondary: 36 },
        { label: "T-4", value: 52, secondary: 38 },
        { label: "T-3", value: 44, secondary: 41 },
        { label: "T-2", value: 59, secondary: 43 },
        { label: "T-1", value: 63, secondary: 47 },
      ];

  const hasNegative = safe.some((d) => d.value < 0 || (d.secondary ?? 0) < 0);

  return (
    <div className="trendChartWrap">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={safe}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={20}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.42)", fontSize: 11 }}
          />
          <YAxis
            tickFormatter={formatTick}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.42)", fontSize: 11 }}
            width={56}
          />
          <RechartsTooltip
            {...tooltipStyle}
            formatter={(value, name) => [
              formatTooltipValue(value),
              name === "secondary" ? secondaryLabel : primaryLabel,
            ]}
          />
          {hasNegative && (
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.22)" strokeDasharray="5 4" strokeWidth={1.5} />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            animationDuration={760}
          />
          {showSecondary && (
            <Line
              type="monotone"
              dataKey="secondary"
              stroke={secondaryColor}
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="6 4"
              animationDuration={820}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompareBarsChart({
  data,
  height = 260,
  showLabels = true,
}: {
  data: PrimitiveDatum[];
  height?: number;
  showLabels?: boolean;
}) {
  const safe = data.length
    ? data
    : ([
        { label: "VaR", value: 62, tone: "negative" },
        { label: "ES", value: 54, tone: "negative" },
        { label: "LC VaR", value: 47, tone: "positive" },
      ] satisfies PrimitiveDatum[]);

  return (
    <div className="barChartWrap">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={safe} layout="vertical" margin={{ top: 4, right: showLabels ? 48 : 16, left: 6, bottom: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            minTickGap={16}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.42)", fontSize: 11 }}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="label"
            tickFormatter={formatCategoryTick}
            tickLine={false}
            axisLine={false}
            width={120}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.78)", fontSize: 12, fontWeight: 600 }}
          />
          <RechartsTooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            {...tooltipStyle}
            formatter={(value) => [`${Number(value ?? 0).toFixed(1)}%`, "Использование"]}
          />
          <Bar dataKey="value" radius={[0, 10, 10, 0]} animationDuration={680} maxBarSize={20}>
            {safe.map((row) => (
              <Cell
                key={row.label}
                fill={
                  row.tone === "negative"
                    ? "#ff7777"
                    : row.tone === "neutral"
                      ? "rgba(244,241,234,0.55)"
                      : "#6eff8e"
                }
              />
            ))}
            {showLabels && (
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v: number) => `${Math.round(v)}%`}
                style={{ fill: "rgba(244,241,234,0.62)", fontSize: 11, fontWeight: 700 }}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutGauge({
  value,
  total = 100,
  label,
  subtitle,
  color = "#6eff8e",
}: {
  value: number;
  total?: number;
  label: string;
  subtitle?: string;
  color?: string;
}) {
  const safeTotal = total <= 0 ? 100 : total;
  const percent = clamp((value / safeTotal) * 100, 0, 100);

  const heroColor: "success" | "warning" | "danger" | "primary" = useMemo(() => {
    if (color === "#ff7777") {
      return percent >= 50 ? "danger" : percent >= 20 ? "warning" : "success";
    }
    return percent >= 100 ? "danger" : percent >= 75 ? "warning" : "success";
  }, [color, percent]);

  return (
    <div className="donutGauge">
      <ProgressCircle
        aria-label={label}
        value={percent}
        color={heroColor}
        size="lg"
        showValueLabel
        classNames={{ value: "donutGaugeValue", svg: "donutGaugeSvg" }}
      />
      <span className="donutGaugeLabel">{label}</span>
      {subtitle ? <div className="donutGaugeSubtitle">{subtitle}</div> : null}
    </div>
  );
}

export function CircularScore({
  value,
  label,
  color = "success",
  hint,
}: {
  value: number;
  label: string;
  color?: "success" | "warning" | "danger" | "primary" | "secondary" | "default";
  hint?: string;
}) {
  return (
    <div className="circularScore">
      <ProgressCircle
        aria-label={label}
        value={clamp(value, 0, 100)}
        color={color}
        size="lg"
        showValueLabel
      />
      <div className="circularScoreMeta">
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  );
}

export function MetricHero({
  label,
  value,
  suffix = "",
  tone = "default",
  chart,
  hint,
  tooltip,
  className,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "default" | "success" | "danger" | "warning";
  chart?: ReactNode;
  hint?: string;
  tooltip?: string;
  className?: string;
}) {
  const card = (
    <motion.div className={`metricHero metricHero--${tone} ${className ?? ""}`} whileHover={{ scale: 1.018 }} transition={spring}>
      <div className="metricHeroHead">
        <span>{label}</span>
        {hint ? <Chip size="sm" variant="flat" radius="sm" className="metricHeroChip">{hint}</Chip> : null}
      </div>
      <AnimatedNumber value={value} suffix={suffix} className="metricHeroValue" />
      {chart ? <div className="metricHeroChart">{chart}</div> : null}
    </motion.div>
  );

  if (tooltip) {
    return (
      <Tooltip content={tooltip} placement="bottom" delay={300} classNames={{ content: "metricTooltip" }}>
        {card}
      </Tooltip>
    );
  }

  return card;
}

export function GlassPanel({
  title,
  subtitle,
  children,
  badge,
  className,
  tooltipContent,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  badge?: ReactNode;
  className?: string;
  tooltipContent?: string;
}) {
  const header = (
    <div className="glassPanelHeaderInner">
      <div className="glassPanelTitleWrap">
        <div className="glassPanelTitle">{title}</div>
        {subtitle ? <div className="glassPanelSubtitle">{subtitle}</div> : null}
      </div>
      {badge}
    </div>
  );

  return (
    <motion.div className={`glassPanel ${className ?? ""}`} whileHover={{ y: -3, scale: 1.004 }} transition={spring}>
      <div className="glassPanelHeader">
        {tooltipContent ? (
          <Tooltip content={tooltipContent} placement="top-start" delay={200} classNames={{ content: "metricTooltip" }}>
            {header}
          </Tooltip>
        ) : header}
      </div>
      <Separator className="glassPanelDivider" />
      <div className="glassPanelBody">
        {children}
      </div>
    </motion.div>
  );
}
