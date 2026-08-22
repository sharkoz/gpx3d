const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export const formatMetric = (value: number | null, unit: string, digits = 0) => {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value)} ${unit}`;
};

export const formatDistance = (metres: number) =>
  metres >= 1_000 ? `${numberFormat.format(metres / 1_000)} km` : `${Math.round(metres)} m`;

export function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remaining = total % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

export const formatLocalDate = (time: number | null) =>
  time === null
    ? "Date inconnue"
    : new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(time);
