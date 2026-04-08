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

    const instance =
      chartRef.current ??
      echarts.init(container, undefined, {
        renderer: "svg",
        width: container.clientWidth || 760,
        height,
      });
    chartRef.current = instance;

    instance.setOption(option, { notMerge: true, lazyUpdate: false });

    const onResize = () => {
      if (!chartRef.current || !containerRef.current) return;
      chartRef.current.resize({ width: containerRef.current.clientWidth || 760, height });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [option, chartId, height]);

  if (!option) {
    return <div className="chartEmpty">{emptyText}</div>;
  }

  return <div ref={containerRef} className="chart-box chart-box--interactive" data-testid={`interactive-chart-${chartId}`} />;
}
