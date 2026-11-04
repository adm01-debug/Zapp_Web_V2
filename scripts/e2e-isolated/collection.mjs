import fs from 'node:fs';
import path from 'node:path';
import { readPlaywrightInventory } from './results.mjs';

export const MAX_COLLECTION_BYTES = 64 * 1024 * 1024;
const fail = code => { throw new Error(code); };

function readReport(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  } catch (error) {
    fail(error?.code === 'ENOENT' ? 'collection-report-missing' : error?.code === 'ELOOP' ? 'collection-report-type' : 'collection-report-read');
  }
  let bytes;
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1) fail('collection-report-type');
    if (!Number.isSafeInteger(before.size) || before.size <= 0 || before.size > MAX_COLLECTION_BYTES) fail('collection-report-size');
    const buffer = Buffer.allocUnsafe(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(descriptor, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    const after = fs.fstatSync(descriptor);
    if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail('collection-report-size');
    bytes = buffer.subarray(0, length);
  } catch (error) {
    if (['collection-report-type', 'collection-report-size'].includes(error?.message)) throw error;
    fail('collection-report-read');
  } finally {
    try { fs.closeSync(descriptor); } catch { fail('collection-report-read'); }
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('collection-report-json'); }
}

/** Same selection and parser; only the reporter transport is different. */
export function collectPlaywrightInventory({ output, scope, projects, execute }) {
  let directory;
  try { directory = fs.mkdtempSync(path.join(output, 'collection-')); fs.chmodSync(directory, 0o700); }
  catch { fail('collection-report-prepare'); }
  const report = path.join(directory, 'report.json');
  // Docker's /output bind maps this fresh runner directory with the same UID/GID.
  const containerReport = '/output/' + path.basename(directory) + '/report.json';
  let result;
  try { result = execute(containerReport); }
  catch { fail(scope === 'login' ? 'collect-login' : 'collect-suite'); }
  if (!result || result.status !== 0 || result.error || result.signal) fail(scope === 'login' ? 'collect-login' : 'collect-suite');
  const json = readReport(report);
  let inventory;
  try { inventory = readPlaywrightInventory(json, { projects }); }
  catch { fail(scope === 'login' ? 'login-inventory-invalid' : 'suite-inventory-invalid'); }
  if (scope === 'login' && inventory.total !== 1) fail('login-inventory-not-exact');
  try { fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify(json, null, 2) + '\n', { mode: 0o600 }); }
  catch { fail('collection-inventory-write'); }
  if (scope === 'suite') {
    try { fs.writeFileSync(path.join(output, 'test-inventory.json'), JSON.stringify(inventory, null, 2) + '\n', { mode: 0o600 }); }
    catch { fail('collection-public-inventory-write'); }
  }
  return inventory;
}
