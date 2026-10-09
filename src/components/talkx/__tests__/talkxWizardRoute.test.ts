import { describe, expect, it } from 'vitest';
import { formatTalkXWizardRoute, parseTalkXWizardRoute } from '@/components/talkx/talkxWizardRoute';

describe('Talk X wizard route contract', () => {
  it('round-trips an existing draft while preserving unrelated query and hash state', () => {
    const source = new URL('https://zapp.example/?view=talkx&filter=mine#main-content');
    const path = formatTalkXWizardRoute(source, { campaignId: 'draft_1', step: 3 });

    expect(path).toBe('/?view=talkx&filter=mine&wizard=draft_1&step=3#main-content');
    expect(parseTalkXWizardRoute(new URL(path, source).search)).toEqual({
      route: { campaignId: 'draft_1', step: 3 },
      needsNormalization: false,
    });
  });

  it('normalizes a missing or invalid step to the safe first step', () => {
    expect(parseTalkXWizardRoute('?view=talkx&wizard=new')).toEqual({
      route: { campaignId: 'new', step: 1 }, needsNormalization: true,
    });
    expect(parseTalkXWizardRoute('?view=talkx&wizard=draft_1&step=9')).toEqual({
      route: { campaignId: 'draft_1', step: 1 }, needsNormalization: true,
    });
  });

  it('rejects duplicated, foreign-view, and malformed campaign routes', () => {
    for (const search of [
      '?view=talkx&wizard=one&wizard=two&step=1',
      '?view=talkx&wizard=draft_1&step=1&step=2',
      '?view=inbox&wizard=draft_1&step=1',
      '?view=talkx&wizard=not/a/campaign&step=1',
    ]) {
      expect(parseTalkXWizardRoute(search)).toEqual({ route: null, needsNormalization: true });
    }
  });

  it('cleans wizard state without deleting the surrounding Talk X view', () => {
    const source = new URL('https://zapp.example/?view=talkx&wizard=draft_1&step=4&tab=overview');
    expect(formatTalkXWizardRoute(source, null)).toBe('/?view=talkx&tab=overview');
  });

  // X134 — `step=N&return=4` é o endereço que o "Editar" da revisão produz: o
  // passo N abre com o destino de volta registrado na URL.
  it('round-trips the "return" step of the review shortcut', () => {
    const source = new URL('https://zapp.example/?view=talkx');
    const path = formatTalkXWizardRoute(source, { campaignId: 'draft_1', step: 1, returnTo: 4 });

    expect(path).toBe('/?view=talkx&wizard=draft_1&step=1&return=4');
    expect(parseTalkXWizardRoute(new URL(path, source).search)).toEqual({
      route: { campaignId: 'draft_1', step: 1, returnTo: 4 },
      needsNormalization: false,
    });
  });

  it('drops and normalizes a duplicated or invalid "return" instead of guessing', () => {
    expect(parseTalkXWizardRoute('?view=talkx&wizard=draft_1&step=1&return=9')).toEqual({
      route: { campaignId: 'draft_1', step: 1 }, needsNormalization: true,
    });
    expect(parseTalkXWizardRoute('?view=talkx&wizard=draft_1&step=1&return=4&return=2')).toEqual({
      route: { campaignId: 'draft_1', step: 1 }, needsNormalization: true,
    });
  });

  it('clears a stray "return" even when the wizard route is gone', () => {
    expect(parseTalkXWizardRoute('?view=talkx&return=4')).toEqual({ route: null, needsNormalization: true });
    const source = new URL('https://zapp.example/?view=talkx&wizard=draft_1&step=4&return=4&tab=overview');
    expect(formatTalkXWizardRoute(source, { campaignId: 'draft_1', step: 4 })).toBe('/?view=talkx&wizard=draft_1&step=4&tab=overview');
    expect(formatTalkXWizardRoute(source, null)).toBe('/?view=talkx&tab=overview');
  });
});
