export function formatCountdown(isoDatetime: string): string {
  const target = new Date(isoDatetime).getTime();
  const now = Date.now();
  const diffMs = target - now;

  if (diffMs <= 0) return "Overdue";

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export function formatRelativeTime(isoDatetime: string): string {
  const target = new Date(isoDatetime).getTime();
  const diffMs = Date.now() - target;
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDateTime(isoDatetime: string): string {
  return new Date(isoDatetime).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
