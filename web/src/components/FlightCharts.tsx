import { useMemo } from "react";
import type { FlightData, FlightPoint } from "@/domain/types";

type FlightChartsProps = {
  flight: FlightData;
  currentTime: number;
  onSeek: (time: number) => void;
};

type Series = {
  label: string;
  unit: string;
  className: string;
  select: (point: FlightPoint) => number | null;
  secondary?: (point: FlightPoint) => number | null;
};

const series: Series[] = [
  {
    label: "Altitude GPX",
    unit: "m",
    className: "altitude-line",
    select: (point) => point.elevation,
  },
  {
    label: "Vitesse sol",
    unit: "km/h",
    className: "speed-line",
    select: (point) => (point.sourceSpeed === null ? null : point.sourceSpeed * 3.6),
    secondary: (point) => (point.calculatedSpeed === null ? null : point.calculatedSpeed * 3.6),
  },
  {
    label: "Vario lissé",
    unit: "m/s",
    className: "vario-line",
    select: (point) => point.verticalSpeed,
  },
];

function seriesPath(
  points: FlightPoint[],
  select: Series["select"],
  start: number,
  duration: number,
  minimum: number,
  maximum: number,
) {
  const step = Math.max(1, Math.ceil(points.length / 900));
  let path = "";
  let drawing = false;
  for (let index = 0; index < points.length; index += step) {
    const point = points[index];
    const value = select(point);
    if (point.time === null || value === null || point.gapBefore) {
      drawing = false;
      continue;
    }
    const x = ((point.time - start) / duration) * 1_000;
    const y = 80 - ((value - minimum) / Math.max(0.0001, maximum - minimum)) * 64;
    path += `${drawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    drawing = true;
  }
  return path;
}

export function FlightCharts({ flight, currentTime, onSeek }: FlightChartsProps) {
  const start = flight.summary.startTime ?? 0;
  const end = flight.summary.endTime ?? start + 1;
  const duration = Math.max(1, end - start);
  const chartData = useMemo(
    () =>
      series.map((item) => {
        const values = flight.points.flatMap((point) => {
          const value = item.select(point);
          return value === null ? [] : [value];
        });
        const secondaryValues = flight.points.flatMap((point) => {
          const value = item.secondary?.(point) ?? null;
          return value === null ? [] : [value];
        });
        const allValues = [...values, ...secondaryValues];
        const minimum = allValues.length ? Math.min(...allValues) : 0;
        const maximum = allValues.length ? Math.max(...allValues) : 1;
        const normalizedMaximum = maximum === minimum ? minimum + 1 : maximum;
        return {
          ...item,
          minimum,
          maximum: normalizedMaximum,
          path: seriesPath(flight.points, item.select, start, duration, minimum, normalizedMaximum),
          secondaryPath: item.secondary
            ? seriesPath(flight.points, item.secondary, start, duration, minimum, normalizedMaximum)
            : null,
        };
      }),
    [duration, flight, start],
  );
  const cursor = Math.max(0, Math.min(100, ((currentTime - start) / duration) * 100));
  const seekFromPointer = (event: React.PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    onSeek(start + fraction * duration);
  };

  return (
    <section
      className="chart-console"
      aria-label="Courbes synchronisées du vol"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event);
      }}
    >
      <div className="chart-cursor-region" aria-hidden="true">
        <div className="chart-cursor" style={{ left: `${cursor}%` }} />
      </div>
      {chartData.map((item) => (
        <div className="chart-row" key={item.label}>
          <div className="chart-label">
            <strong>{item.label}</strong>
            <span>
              {Math.round(item.maximum)} {item.unit}
            </span>
            <span>
              {Math.round(item.minimum)} {item.unit}
            </span>
          </div>
          <svg viewBox="0 0 1000 90" preserveAspectRatio="none" aria-hidden="true">
            <path className="chart-grid" d="M0 16H1000M0 48H1000M0 80H1000" />
            {item.secondaryPath && <path className="calculated-line" d={item.secondaryPath} />}
            <path className={item.className} d={item.path} />
          </svg>
        </div>
      ))}
    </section>
  );
}
