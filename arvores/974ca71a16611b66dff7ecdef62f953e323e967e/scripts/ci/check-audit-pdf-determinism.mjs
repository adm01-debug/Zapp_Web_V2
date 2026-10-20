import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const generator = join(root, 'generate_audit_pdf.ts');
const dir = mkdtempSync(join(tmpdir(), 'zapp-audit-pdf-'));
const zones = ['UTC', 'America/Sao_Paulo', 'Pacific/Kiritimati'];

const hashes = zones.map((TZ) => {
  const output = join(dir, `${TZ.replaceAll('/', '_')}.pdf`);
  execFileSync(process.execPath, [generator], {
    cwd: root,
    env: { ...process.env, TZ, AUDIT_PDF_OUTPUT_PATH: output },
    stdio: 'pipe',
  });
  return createHash('sha256').update(readFileSync(output)).digest('hex');
});

if (new Set(hashes).size !== 1) {
  throw new Error(`audit_report.pdf is timezone-dependent: ${zones.join(', ')}`);
}

console.log(`Audit PDF deterministic across ${zones.length} time zones: ${hashes[0]}`);
