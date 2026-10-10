import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStorageBuckets, loadBaseline } from './realtime-publication-baseline.js';

const baseline = loadBaseline();

function makeBucket(id, overrides = {}) {
  return { id, name: id, public: false, file_size_limit: null, ...overrides };
}

function currentFromBaseline() {
  return baseline.buckets.map((b) => ({
    id: b.id,
    public: b.public,
    file_size_limit: b.file_size_limit,
  }));
}

test('validateStorageBuckets: aprova quando tudo confere', () => {
  const result = validateStorageBuckets(currentFromBaseline(), baseline);
  assert.equal(result.pass, true);
  assert.equal(result.failures.length, 0);
});

test('validateStorageBuckets: reprova bucket novo', () => {
  const current = [...currentFromBaseline()];
  current.push(makeBucket('bucket-novo', { public: true }));
  const result = validateStorageBuckets(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('bucket novo')));
});

test('validateStorageBuckets: reprova bucket que virou publico', () => {
  const current = baseline.buckets.map((b) => ({
    id: b.id,
    public: b.id === 'audio-messages' ? true : b.public,
    file_size_limit: b.file_size_limit,
  }));
  const result = validateStorageBuckets(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('virou p\u00fablico')));
});

test('validateStorageBuckets: reprova limite alterado', () => {
  const current = baseline.buckets.map((b) => ({
    id: b.id,
    public: b.public,
    file_size_limit: b.id === 'avatars' ? 1048576 : b.file_size_limit,
  }));
  const result = validateStorageBuckets(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('limite alterado')));
});

test('validateStorageBuckets: reprova bucket removido', () => {
  const current = currentFromBaseline().filter((b) => b.id !== 'stickers');
  const result = validateStorageBuckets(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('bucket removido')));
});

test('validateStorageBuckets: reprova limite que foi de null para valor', () => {
  const current = baseline.buckets.map((b) => ({
    id: b.id,
    public: b.public,
    file_size_limit: b.id === 'audio-memes' ? 1048576 : b.file_size_limit,
  }));
  const result = validateStorageBuckets(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('limite alterado')));
});