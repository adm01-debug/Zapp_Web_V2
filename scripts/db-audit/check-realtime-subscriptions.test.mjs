import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateRealtimeSubscriptions, extractRealtimeSubscriptions } from './check-realtime-subscriptions.mjs';

test('extracts direct channel and shared-hook subscriptions from TypeScript', () => {
  const result = extractRealtimeSubscriptions(`
    channel.on('postgres_changes' as never, { schema: 'public', table: 'messages' }, handler);
    useSupabaseRealtime({ channelName: 'notifications', table: 'notifications', onAll: handler });
  `);
  assert.deepEqual(result.subscriptions.sort(), ['public.messages', 'public.notifications']);
  assert.deepEqual(result.unresolved, []);
});

test('fails closed when a subscription table is dynamic', () => {
  const result = extractRealtimeSubscriptions(`channel.on('postgres_changes', { schema: 'public', table }, handler);`);
  assert.equal(result.subscriptions.length, 0);
  assert.equal(result.unresolved.length, 1);
});

test('rejects code subscriptions absent from the reviewed publication baseline', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'realtime-subscriptions-'));
  fs.writeFileSync(path.join(root, 'valid.ts'), `channel.on('postgres_changes', { table: 'messages' }, handler);`);
  fs.writeFileSync(path.join(root, 'invalid.tsx'), `channel.on('postgres_changes', { table: 'audit_logs' }, handler);`);
  const result = evaluateRealtimeSubscriptions(root, ['public.messages']);
  assert.deepEqual(result.absentFromPublication, ['public.audit_logs']);
});

test('the repository has no unresolved or dead Realtime subscriptions', () => {
  const result = evaluateRealtimeSubscriptions();
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.absentFromPublication, []);
});
