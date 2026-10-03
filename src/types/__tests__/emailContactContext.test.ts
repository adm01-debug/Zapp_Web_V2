import { describe, expect, it } from 'vitest';
import { isEmailContactContext } from '../emailContactContext';

const source = { linked: false, consultedAt: '2026-10-03T12:00:00.000Z', resolution: 'email_exact', participantEmail: 'person@example.com' };

describe('isEmailContactContext', () => {
  it('accepts the explicit non-linked state returned by the Edge Function', () => {
    expect(isEmailContactContext({ status: 'not_linked', company: null, source })).toBe(true);
  });

  it('rejects an available context without a safe company shape', () => {
    expect(isEmailContactContext({ status: 'available', company: { id: 'company' }, source })).toBe(false);
  });

  it('rejects an unmodelled server state rather than rendering arbitrary data', () => {
    expect(isEmailContactContext({ status: 'permission_denied', company: null, source })).toBe(false);
  });
});
