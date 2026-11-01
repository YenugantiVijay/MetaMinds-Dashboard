export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll("_", " ");
  return <span className={`status-pill status-${normalized.replaceAll(" ", "-")}`}>{normalized}</span>;
}
