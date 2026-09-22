import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

test('15 historical limitations pin local files without manufacturing historical proof', () => {
  const report = JSON.parse(fs.readFileSync(new URL('./ledger-history-limitations.json', import.meta.url)));
  const exceptions = JSON.parse(fs.readFileSync(new URL('./migration-evidence.json', import.meta.url)));
  assert.equal(report.historical_content_proven, false);
  assert.equal(report.entries.length, 15);
  assert.equal(new Set(report.entries.map(row => row.version)).size, 15);
  assert.equal(report.entries.filter(row => row.evidence_class === 'name-and-file-pinned').length, 11);
  for (const row of report.entries) {
    assert.match(row.filename, new RegExp(`^${row.version}_[a-z0-9_-]+\\.sql$`));
    const content = fs.readFileSync(new URL(`../../supabase/migrations/${row.filename}`, import.meta.url));
    assert.equal(createHash('sha256').update(content).digest('hex'), row.local_file_sha256);
    assert.equal('historical_sql_sha256' in row, false);
    if (row.evidence_class === 'name-and-file-pinned') {
      assert.ok(exceptions.exceptions.some(ex => ex.version === row.version && ex.kind === 'ledger-only/name-and-file-pinned' && ex.file_sha256 === row.local_file_sha256));
    } else {
      assert.equal(row.evidence_class, 'live-guard-warning-no-historical-content');
      assert.equal(exceptions.exceptions.some(ex => ex.version === row.version), false, 'warning inventory must not silently create a trust exception');
    }
  }
});
