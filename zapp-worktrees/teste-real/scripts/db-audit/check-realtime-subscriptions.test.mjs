import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateRealtimeSubscriptions, extractRealtimeSubscriptions } from './check-realtime-subscriptions.mjs';

test('extracts direct channel and shared-hook subscriptions from TypeScript', () => {
  const result = extractRealtimeSubscriptions(`
    channel.on('postgres_changes' as never, { schema: 'public', table: 'messages' }, handler);
    import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';
    useSupabaseRealtime({ channelName: 'notifications', table: 'notifications', onAll: handler });
  `);
  assert.deepEqual(result.subscriptions.sort(), ['public.messages', 'public.notifications']);
  assert.deepEqual(result.unresolved, []);
});

test('fails closed for dynamic schemas and object spreads', () => {
  for (const source of [
    `channel.on('postgres_changes', { schema, table: 'notifications' }, handler);`,
    `channel.on('postgres_changes', { schema: 'public', table: 'notifications', ...override }, handler);`,
    `channel.on('postgres_changes', { schema: 'public', table: 'notifications', ...overrideSchema }, handler);`,
  ]) {
    const result = extractRealtimeSubscriptions(source);
    assert.equal(result.subscriptions.length, 0);
    assert.equal(result.unresolved.length, 1);
  }
});

test('resolves const event aliases and bracket/bound on calls', () => {
  for (const source of [
    `const event = 'postgres_changes'; channel.on(event, { table: 'messages' }, handler);`,
    `channel['on']('postgres_changes', { table: 'messages' }, handler);`,
    `const subscribe = channel.on.bind(channel); subscribe('postgres_changes', { table: 'messages' }, handler);`,
  ]) {
    const result = extractRealtimeSubscriptions(source);
    assert.deepEqual(result.subscriptions, ['public.messages']);
    assert.deepEqual(result.unresolved, []);
  }
});

test('resolves imported wrapper aliases and namespaces', () => {
  for (const source of [
    `import { useSupabaseRealtime as subscribe } from '@/hooks/realtime/useSupabaseRealtime'; subscribe({ table: 'messages' });`,
    `import * as realtime from '@/hooks/realtime'; realtime.useSupabaseRealtime({ table: 'messages' });`,
    `import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime'; const subscribe = useSupabaseRealtime; subscribe({ table: 'messages' });`,
  ]) {
    const result = extractRealtimeSubscriptions(source);
    assert.deepEqual(result.subscriptions, ['public.messages']);
    assert.deepEqual(result.unresolved, []);
  }
});

test('fails closed for an alias of the canonical wrapper when an import is omitted', () => {
  const result = extractRealtimeSubscriptions(`
    const subscribe = useSupabaseRealtime;
    subscribe({ table: 'audit_logs' });
  `);
  assert.deepEqual(result.subscriptions, ['public.audit_logs']);
  assert.deepEqual(result.unresolved, []);
});

test('does not exempt an unrelated file with the wrapper basename', () => {
  const result = extractRealtimeSubscriptions(
    `channel.on('postgres_changes', { table }, handler);`,
    'src/unrelated/useSupabaseRealtime.ts',
  );
  assert.equal(result.unresolved.length, 1);
});

test('does not confuse a shadowed local function with the imported wrapper', () => {
  const result = extractRealtimeSubscriptions(`
    function useSupabaseRealtime(config) { return config; }
    useSupabaseRealtime({ table });
  `);
  assert.deepEqual(result.subscriptions, []);
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
