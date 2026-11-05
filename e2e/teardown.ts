import { rmSync } from 'node:fs';

// Datenordner des Test-Servers nach dem Lauf entfernen
export default function teardown(): void {
  const dir = process.env.STECKPLAN_E2E_DATA_DIR;
  if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}
