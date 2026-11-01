let csrfToken = "";

export function getCsrfToken(): string {
  return csrfToken;
}

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const send = () =>
    fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.method && options.method !== "GET" ? { "X-CSRF-Token": csrfToken } : {}),
        ...options.headers,
      },
    });

  let response = await send();
  let payload = await response.json().catch(() => ({}));

  if (
    response.status === 403 &&
    payload.error === "Your session expired. Refresh the page and try again." &&
    options.method !== "GET"
  ) {
    const sessionResponse = await fetch("/api/auth/me", { credentials: "same-origin" });
    const session = await sessionResponse.json().catch(() => ({}));
    if (sessionResponse.ok && session.csrfToken) {
      csrfToken = session.csrfToken;
      response = await send();
      payload = await response.json().catch(() => ({}));
    }
  }

  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  if (payload.csrfToken) csrfToken = payload.csrfToken;
  return payload as T;
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00`)
  );
}

export function formatTime(value?: string | null, timezone = "Asia/Kolkata"): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(
    new Date(value)
  );
}

export function durationLabel(minutes?: number | null): string {
  if (minutes === null || minutes === undefined) return "In progress";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
