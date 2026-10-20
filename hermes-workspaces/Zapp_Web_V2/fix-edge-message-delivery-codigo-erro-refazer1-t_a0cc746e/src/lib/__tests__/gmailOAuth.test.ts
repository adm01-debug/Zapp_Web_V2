import { describe, it, expect, beforeEach } from 'vitest';
import { createGmailOAuthState, parseGmailOAuthState } from '@/lib/gmailOAuth';

// R2-COM-009 — o state do retorno OAuth do Gmail só é válido quando existe um
// nonce armazenado nesta sessão e ele confere com o nonce embutido no state.
// Sem nonce armazenado (sessão nova, aba nova, troca de sessão) o retorno NÃO
// pode ser tratado como legítimo.

describe('parseGmailOAuthState', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('aceita state cujo nonce confere com o armazenado e o consome (uso único)', () => {
    const state = createGmailOAuthState({ view: 'integrations', integrationView: 'gmail' });

    const parsed = parseGmailOAuthState(state);

    expect(parsed).not.toBeNull();
    expect(parsed?.view).toBe('integrations');
    expect(parsed?.integrationView).toBe('gmail');
    // nonce consumido: um segundo parse do MESMO state não pode passar (anti-replay no cliente)
    expect(parseGmailOAuthState(state)).toBeNull();
  });

  it('rejeita state quando NÃO há nonce armazenado na sessão', () => {
    // Simula retorno de OAuth em aba/sessão que não iniciou a conexão: o state
    // é bem formado e até traz um nonce, mas a sessão nunca registrou um.
    const forgedState = JSON.stringify({ view: 'integrations', integrationView: 'gmail', nonce: 'nonce-do-atacante' });

    expect(parseGmailOAuthState(forgedState)).toBeNull();
  });

  it('rejeita state com nonce divergente do armazenado', () => {
    createGmailOAuthState({ view: 'integrations' }); // grava o nonce real
    const divergent = JSON.stringify({ view: 'integrations', nonce: 'outro-nonce' });

    expect(parseGmailOAuthState(divergent)).toBeNull();
  });

  it('rejeita state bem formado mas sem campo nonce', () => {
    createGmailOAuthState({ view: 'integrations' });
    const noNonce = JSON.stringify({ view: 'integrations' });

    expect(parseGmailOAuthState(noNonce)).toBeNull();
  });

  it('rejeita JSON inválido, null e state sem view', () => {
    createGmailOAuthState({ view: 'integrations' });

    expect(parseGmailOAuthState('{not-json')).toBeNull();
    expect(parseGmailOAuthState(null)).toBeNull();
    expect(parseGmailOAuthState(JSON.stringify({ integrationView: 'gmail' }))).toBeNull();
  });
});
