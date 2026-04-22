import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { ECharts, EChartsOption } from "echarts";

interface InteractiveRiskChartProps {
  option: EChartsOption | null;
  emptyText: string;
  chartId: string;
  height?: number;
}

export default function InteractiveRiskChart({ option, emptyText, chartId, height = 360 }: InteractiveRiskChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !option) return;

    const isJsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
    if (isJsdom) return;

    const resolveWidth = () => {
      if (!containerRef.current) return 0;
      return Math.floor(containerRef.current.clientWidth || containerRef.current.getBoundingClientRect().width || 0);
    };

    const initialWidth = resolveWidth();

    const instance =
      chartRef.current ??
      echarts.init(container, undefined, {
        renderer: "svg",
        ...(initialWidth > 0 ? { width: initialWidth } : {}),
        height,
      });
    chartRef.current = instance;

    instance.setOption(option, { notMerge: true, lazyUpdate: false });

    const onResize = () => {
      if (!chartRef.current || !containerRef.current) return;
      const nextWidth = resolveWidth();
      chartRef.current.resize({
        ...(nextWidth > 0 ? { width: nextWidth } : {}),
        height,
      });
    };
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    if (resizeObserver) resizeObserver.observe(container);
    const raf = window.requestAnimationFrame(onResize);
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      resizeObserver?.disconnect();
    };
  }, [option, chartId, height]);

  if (!option) {
    return <div className="chartEmpty">{emptyText}</div>;
  }

  return (
    <div
      ref={containerRef}
      className="chart-box chart-box--interactive"
      data-testid={`interactive-chart-${chartId}`}
      style={{ height }}
    />
  );
}
