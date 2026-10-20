/**
 * Returns the canonical Evolution instance only when the database connection
 * is explicitly live. The value is trimmed before being interpolated into an
 * Evolution route, so a whitespace-only legacy row cannot become a request.
 */
export function liveTalkXInstanceId(connection: {
  status?: unknown;
  instance_id?: unknown;
} | null | undefined): string | null {
  if (connection?.status !== "connected" || typeof connection.instance_id !== "string") {
    return null;
  }

  const instanceId = connection.instance_id.trim();
  return instanceId.length > 0 ? instanceId : null;
}
