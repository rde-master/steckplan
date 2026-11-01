import type { HealthInfo } from '@steckplan/core';

export async function fetchHealth(signal?: AbortSignal): Promise<HealthInfo> {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as HealthInfo;
}
