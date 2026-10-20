/**
 * SEC-FRONTEND-03 — o rascunho de conversa do Inbox passa a ter dono:
 * `zapp.inbox.draft:<userId>:<contactId>`. O formato antigo (`chat_draft_<contato>`)
 * não tem dono e é esvaziado sem leitura; o sign-out esvazia o prefixo novo.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  INBOX_DRAFT_KEY_PREFIX,
  LEGACY_INBOX_DRAFT_KEY_PREFIX,
  inboxDraftStorageKey,
  readInboxDraft,
  writeInboxDraft,
  removeInboxDraft,
  purgeLegacyInboxDrafts,
  clearInboxDraftSessions,
} from '../inboxDraftSession';

describe('inboxDraftSession (SEC-FRONTEND-03)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('monta a chave com o dono e o contato', () => {
    expect(inboxDraftStorageKey('atendente-b', 'contato-x')).toBe('zapp.inbox.draft:atendente-b:contato-x');
  });

  it('não monta chave sem usuário ou sem contato', () => {
    expect(inboxDraftStorageKey(null, 'contato-x')).toBeNull();
    expect(inboxDraftStorageKey('atendente-b', '')).toBeNull();
    expect(inboxDraftStorageKey(undefined, undefined)).toBeNull();
  });

  it('grava, lê e apaga pelo par dono + contato', () => {
    const chave = inboxDraftStorageKey('atendente-b', 'contato-x');

    writeInboxDraft(chave, 'oi');
    expect(readInboxDraft(chave)).toBe('oi');

    removeInboxDraft(chave);
    expect(readInboxDraft(chave)).toBeNull();

    expect(readInboxDraft(null)).toBeNull();
    writeInboxDraft(null, 'sem dono');
    expect(localStorage.length).toBe(0);
  });

  it('esvazia o formato antigo sem dono e preserva o rascunho do dono', () => {
    localStorage.setItem(`${LEGACY_INBOX_DRAFT_KEY_PREFIX}contato-x`, 'texto do atendente A');
    localStorage.setItem(`${LEGACY_INBOX_DRAFT_KEY_PREFIX}contato-y`, 'texto do atendente A');
    localStorage.setItem(`${INBOX_DRAFT_KEY_PREFIX}atendente-b:contato-x`, 'texto do atendente B');

    expect(purgeLegacyInboxDrafts()).toBe(2);

    expect(localStorage.getItem(`${LEGACY_INBOX_DRAFT_KEY_PREFIX}contato-x`)).toBeNull();
    expect(localStorage.getItem(`${INBOX_DRAFT_KEY_PREFIX}atendente-b:contato-x`)).toBe('texto do atendente B');
  });

  it('no sign-out esvazia os rascunhos do Inbox e preserva o que não é rascunho', () => {
    localStorage.setItem(`${INBOX_DRAFT_KEY_PREFIX}atendente-b:contato-x`, 'texto do atendente B');
    localStorage.setItem('zapp.inbox.files.view:atendente-b', '{"v":1}');

    expect(clearInboxDraftSessions()).toBe(1);

    expect(localStorage.getItem(`${INBOX_DRAFT_KEY_PREFIX}atendente-b:contato-x`)).toBeNull();
    expect(localStorage.getItem('zapp.inbox.files.view:atendente-b')).toBe('{"v":1}');
  });
});
