import { beforeEach, describe, expect, it } from 'vitest';
import {
  emailDraftSessionKey,
  readEmailDraftSession,
  removeEmailDraftSession,
  writeEmailDraftSession,
} from '@/lib/emailDraftSession';

describe('emailDraftSession', () => {
  beforeEach(() => localStorage.clear());

  it('isola rascunhos por conta, modo, thread e mensagem alvo', () => {
    expect(emailDraftSessionKey({ accountId: 'a', mode: 'reply', threadId: 't', messageId: 'm1' }))
      .not.toBe(emailDraftSessionKey({ accountId: 'a', mode: 'reply', threadId: 't', messageId: 'm2' }));
    expect(emailDraftSessionKey({ accountId: 'a', mode: 'new' }))
      .not.toBe(emailDraftSessionKey({ accountId: 'b', mode: 'new' }));
    expect(emailDraftSessionKey({ userId: 'u1', accountId: 'a', mode: 'new' }))
      .not.toBe(emailDraftSessionKey({ userId: 'u2', accountId: 'a', mode: 'new' }));
  });

  it('restaura conteúdo e o id remoto sem persistir bytes de arquivos', () => {
    const key = emailDraftSessionKey({ accountId: 'a', mode: 'new' });
    writeEmailDraftSession(key, {
      draftId: 'draft-1', to: 'cliente@example.com', cc: '', bcc: '', subject: 'Assunto',
      body: 'Conteúdo', isUsingHtml: false, attachmentNames: ['proposta.pdf'], updatedAt: new Date().toISOString(),
    });
    expect(readEmailDraftSession(key)).toMatchObject({
      draftId: 'draft-1', to: 'cliente@example.com', subject: 'Assunto', attachmentNames: ['proposta.pdf'],
    });
    expect(localStorage.getItem(key!)).not.toContain('base64');
  });

  it('ignora payload inválido e remove somente a composição informada', () => {
    const key = emailDraftSessionKey({ accountId: 'a', mode: 'new' });
    localStorage.setItem(key!, '{inválido');
    expect(readEmailDraftSession(key)).toBeNull();
    removeEmailDraftSession(key);
    expect(localStorage.getItem(key!)).toBeNull();
  });

  it('expira rascunhos locais após sete dias', () => {
    const key = emailDraftSessionKey({ accountId: 'a', mode: 'new' });
    writeEmailDraftSession(key, {
      to: 'cliente@example.com', cc: '', bcc: '', subject: 'Antigo', body: 'Conteúdo', isUsingHtml: true,
      attachmentNames: [], updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(readEmailDraftSession(key)).toBeNull();
    expect(localStorage.getItem(key!)).toBeNull();
  });
});
