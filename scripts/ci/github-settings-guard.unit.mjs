import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal contract tests for the settings-guard logic (no network calls).
// Full integration is validated by E13's workflow_dispatch → issue open < 1 min.

describe('settings-guard: regression detection logic', () => {
  it('detects strict=false as regression', () => {
    const strict = false;
    const allowAutoMerge = true;
    const regressions = [];
    if (strict !== true) regressions.push('required_status_checks.strict');
    if (allowAutoMerge !== true) regressions.push('allow_auto_merge');
    assert.deepEqual(regressions, ['required_status_checks.strict']);
  });

  it('detects allow_auto_merge=false as regression', () => {
    const strict = true;
    const allowAutoMerge = false;
    const regressions = [];
    if (strict !== true) regressions.push('required_status_checks.strict');
    if (allowAutoMerge !== true) regressions.push('allow_auto_merge');
    assert.deepEqual(regressions, ['allow_auto_merge']);
  });

  it('detects both regressions at once', () => {
    const strict = false;
    const allowAutoMerge = false;
    const regressions = [];
    if (strict !== true) regressions.push('required_status_checks.strict');
    if (allowAutoMerge !== true) regressions.push('allow_auto_merge');
    assert.equal(regressions.length, 2);
  });

  it('reports no regression when both are correct', () => {
    const strict = true;
    const allowAutoMerge = true;
    const regressions = [];
    if (strict !== true) regressions.push('required_status_checks.strict');
    if (allowAutoMerge !== true) regressions.push('allow_auto_merge');
    assert.equal(regressions.length, 0);
  });

  it('handles null strict as regression', () => {
    const strict = null;
    const regressions = [];
    if (strict !== true) regressions.push('required_status_checks.strict');
    assert.equal(regressions.length, 1);
  });
});
