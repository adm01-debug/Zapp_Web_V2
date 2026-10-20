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

  it('rejects malformed nested company fields before the panel can render them', () => {
    expect(isEmailContactContext({
      status: 'available', source,
      company: {
        id: 'company', name: 'Empresa', legalName: null, website: null, logoUrl: null,
        industry: null, location: null, about: { unsafe: true }, relationships: [], relationshipsKnown: true,
        socials: [], socialsKnown: true, aboutKnown: true, updatedAt: null,
      },
    })).toBe(false);
  });

  it('rejects social platforms outside the deliberately projected Email contract', () => {
    expect(isEmailContactContext({
      status: 'available', source,
      company: {
        id: 'company', name: 'Empresa', legalName: null, website: null, logoUrl: null,
        industry: null, location: null, about: null, relationships: [], relationshipsKnown: true,
        socials: [{ platform: 'facebook', url: 'https://facebook.example/empresa' }], socialsKnown: true,
        aboutKnown: true, updatedAt: null,
      },
    })).toBe(false);
  });

  it('accepts only bounded, typed explicit choices in the ambiguous state', () => {
    expect(isEmailContactContext({
      status: 'ambiguous', company: null, source,
      candidates: [
        { externalContactId: 'crm-a', companyId: 'company-a', companyName: 'A' },
        { externalContactId: 'crm-b', companyId: null, companyName: null },
      ],
    })).toBe(true);
  });

  it('rejects an unmodelled server state rather than rendering arbitrary data', () => {
    expect(isEmailContactContext({ status: 'permission_denied', company: null, source })).toBe(false);
  });
});
