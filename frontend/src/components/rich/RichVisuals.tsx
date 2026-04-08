import { PropsWithChildren, ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Chip, CircularProgress } from "@heroui/react";
import { motion, useInView } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
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
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(Math.abs(value) < 10 ? 2 : 1);
}

function formatTooltipValue(value: unknown) {
  return formatChartValue(typeof value === "number" ? value : Number(value ?? 0));
}

const spring = { type: "spring", stiffness: 120, damping: 18, mass: 0.8 } as const;

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
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: 0.08,
          },
        },
      }}
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
      variants={{
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: spring },
      }}
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
    let frame = 0;
    let raf = 0;
    const start = performance.now();
    const duration = 600;
    const from = 0;
    const to = value;

    const tick = (now: number) => {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    frame = window.setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 60);

    return () => {
      window.clearTimeout(frame);
      cancelAnimationFrame(raf);
    };
  }, [inView, value]);

  return (
    <div ref={ref} className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
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
    : [
        { label: "1", value: 24 },
        { label: "2", value: 28 },
        { label: "3", value: 19 },
        { label: "4", value: 36 },
        { label: "5", value: 31 },
      ];

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
          <RechartsTooltip
            cursor={false}
            contentStyle={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(10,10,12,0.94)" }}
            labelStyle={{ color: "rgba(244,241,234,0.58)" }}
          />
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
}: {
  data: PrimitiveDatum[];
  color?: string;
  accent?: string;
  valueKey?: string;
  secondaryKey?: string;
  showSecondary?: boolean;
  height?: number;
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

  return (
    <div className="trendChartWrap">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={safe}>
          <defs>
            <linearGradient id={`area-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.42} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={20}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.46)", fontSize: 11 }}
          />
          <YAxis
            tickFormatter={formatTick}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.46)", fontSize: 11 }}
            width={56}
          />
          <RechartsTooltip
            contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(10,10,12,0.94)" }}
            labelStyle={{ color: "rgba(244,241,234,0.58)" }}
            formatter={(value) => formatTooltipValue(value)}
          />
          <Area type="monotone" dataKey={valueKey} stroke={color} fill={`url(#area-${gradientId})`} strokeWidth={3} animationDuration={750} />
          {showSecondary ? (
            <Line type="monotone" dataKey={secondaryKey} stroke={accent} strokeWidth={2} dot={false} animationDuration={800} />
          ) : null}
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
}: {
  data: PrimitiveDatum[];
  color?: string;
  secondaryColor?: string;
  showSecondary?: boolean;
  height?: number;
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

  return (
    <div className="trendChartWrap">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={safe}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={20}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.46)", fontSize: 11 }}
          />
          <YAxis
            tickFormatter={formatTick}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.46)", fontSize: 11 }}
            width={56}
          />
          <RechartsTooltip
            contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(10,10,12,0.94)" }}
            labelStyle={{ color: "rgba(244,241,234,0.58)" }}
            formatter={(value) => formatTooltipValue(value)}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={3} dot={false} animationDuration={760} />
          {showSecondary ? (
            <Line type="monotone" dataKey="secondary" stroke={secondaryColor} strokeWidth={2} dot={false} strokeDasharray="5 5" animationDuration={820} />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompareBarsChart({
  data,
  height = 260,
}: {
  data: PrimitiveDatum[];
  height?: number;
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
        <BarChart data={safe} layout="vertical" margin={{ top: 8, right: 16, left: 6, bottom: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            minTickGap={16}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.46)", fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="label"
            tickFormatter={formatCategoryTick}
            tickLine={false}
            axisLine={false}
            width={124}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.78)", fontSize: 11 }}
          />
          <RechartsTooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(10,10,12,0.94)" }}
            labelStyle={{ color: "rgba(244,241,234,0.58)" }}
            formatter={(value) => formatTooltipValue(value)}
          />
          <Bar dataKey="value" radius={[12, 12, 12, 12]} animationDuration={680}>
            {safe.map((row) => (
              <Cell
                key={row.label}
                fill={
                  row.tone === "negative"
                    ? "#ff7777"
                    : row.tone === "neutral"
                      ? "rgba(244,241,234,0.7)"
                      : "#6eff8e"
                }
              />
            ))}
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
  const isComplete = percent >= 100;
  const data = isComplete
    ? [{ name: "value", value: 100 }]
    : [
        { name: "value", value: percent },
        { name: "rest", value: Math.max(0, 100 - percent) },
      ];

  return (
    <div className="donutGauge">
      <div className="donutGaugeChart">
        <ResponsiveContainer width="100%" height={172}>
          <PieChart>
            <Pie
              data={data}
              innerRadius={52}
              outerRadius={72}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              paddingAngle={isComplete ? 0 : 4}
              animationDuration={800}
              stroke="none"
            >
              <Cell fill={color} />
              {!isComplete ? <Cell fill="rgba(255,255,255,0.08)" /> : null}
            </Pie>
            <RechartsTooltip
              contentStyle={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(10,10,12,0.94)" }}
              formatter={(chartValue) => `${Number(chartValue ?? 0).toFixed(1)}%`}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donutGaugeCenter">
          <AnimatedNumber value={percent} suffix="%" decimals={0} className="donutGaugeValue" />
          <span>{label}</span>
        </div>
      </div>
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
      <CircularProgress
        aria-label={label}
        value={clamp(value, 0, 100)}
        color={color}
        size="lg"
        showValueLabel
        classNames={{
          svg: "circularScoreSvg",
          indicator: "circularScoreIndicator",
          track: "circularScoreTrack",
          value: "circularScoreValue",
        }}
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
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "default" | "success" | "danger" | "warning";
  chart?: ReactNode;
  hint?: string;
}) {
  return (
    <motion.div className={`metricHero metricHero--${tone}`} whileHover={{ scale: 1.018 }} transition={spring}>
      <div className="metricHeroHead">
        <span>{label}</span>
        {hint ? <Chip size="sm" variant="flat" radius="sm" className="metricHeroChip">{hint}</Chip> : null}
      </div>
      <AnimatedNumber value={value} suffix={suffix} className="metricHeroValue" />
      {chart ? <div className="metricHeroChart">{chart}</div> : null}
    </motion.div>
  );
}

export function GlassPanel({
  title,
  subtitle,
  children,
  badge,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={`glassPanel ${className ?? ""}`} whileHover={{ y: -4, scale: 1.005 }} transition={spring}>
      <div className="glassPanelHeader">
        <div>
          <div className="glassPanelTitle">{title}</div>
          {subtitle ? <div className="glassPanelSubtitle">{subtitle}</div> : null}
        </div>
        {badge}
      </div>
      {children}
    </motion.div>
  );
}
