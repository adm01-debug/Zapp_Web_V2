import { describe, it, expect } from 'vitest';
import {
  AGENT_SENDER_FALLBACK,
  CONTACT_SENDER_FALLBACK,
  SELF_SENDER_NAME,
  TEAM_SENDER_NAME,
  initialsOf,
  resolveSenderIdentity,
  senderProfileName,
  stableColorOf,
  type SenderProfileMap,
} from '@/lib/fileSenderIdentity';

const CONTATO = { name: 'Maria Souza', avatar_url: 'https://cdn.test/maria.png' };
const EU = 'prof-eu';
const OUTRO = 'prof-ana';

const perfis: SenderProfileMap = {
  [EU]: { id: EU, name: 'Joaquim Ataides', nickname: null, avatar_url: 'https://cdn.test/eu.png' },
  [OUTRO]: { id: OUTRO, name: 'Ana Lima', nickname: 'Aninha', avatar_url: 'https://cdn.test/ana.png' },
  'prof-sem-nome': { id: 'prof-sem-nome', name: '   ', nickname: 'Juca', avatar_url: null },
  'prof-vazio': { id: 'prof-vazio', name: '  ', nickname: '', avatar_url: null },
};

describe('resolveSenderIdentity — quem enviou (R01 / D01)', () => {
  it('sender="contact" usa o nome e a foto do contato', () => {
    const id = resolveSenderIdentity({
      item: { sender: 'contact', agentId: null }, currentUserId: EU, contact: CONTATO, profiles: perfis,
    });
    expect(id).toEqual({ kind: 'contact', name: 'Maria Souza', avatarUrl: 'https://cdn.test/maria.png' });
  });

  it('sender="contact" sem cadastro nao quebra: fallback legivel e sem foto', () => {
    expect(resolveSenderIdentity({
      item: { sender: 'contact', agentId: null }, currentUserId: EU, contact: null, profiles: perfis,
    })).toEqual({ kind: 'contact', name: CONTACT_SENDER_FALLBACK, avatarUrl: null });

    expect(resolveSenderIdentity({
      item: { sender: 'contact', agentId: null }, currentUserId: EU, contact: { name: '   ' }, profiles: perfis,
    })).toEqual({ kind: 'contact', name: CONTACT_SENDER_FALLBACK, avatarUrl: null });
  });

  it('agent_id do usuario logado vira "Você" com a foto dele', () => {
    const id = resolveSenderIdentity({
      item: { sender: 'agent', agentId: EU }, currentUserId: EU, contact: CONTATO, profiles: perfis,
    });
    expect(id.kind).toBe('self');
    expect(id.name).toBe(SELF_SENDER_NAME);
    expect(id.avatarUrl).toBe('https://cdn.test/eu.png');
  });

  it('"Você" continua legivel quando o proprio perfil ainda nao carregou (sem foto)', () => {
    const id = resolveSenderIdentity({
      item: { sender: 'agent', agentId: EU }, currentUserId: EU, contact: null, profiles: {},
    });
    expect(id).toEqual({ kind: 'self', name: SELF_SENDER_NAME, avatarUrl: null });
  });

  it('agent_id de outro atendente usa nome e foto do perfil', () => {
    const id = resolveSenderIdentity({
      item: { sender: 'agent', agentId: OUTRO }, currentUserId: EU, contact: CONTATO, profiles: perfis,
    });
    expect(id).toEqual({ kind: 'agent', name: 'Ana Lima', avatarUrl: 'https://cdn.test/ana.png' });
  });

  it('perfil ausente nao quebra: nome "Atendente" sem foto', () => {
    const id = resolveSenderIdentity({
      item: { sender: 'agent', agentId: 'prof-desconhecido' }, currentUserId: EU, contact: null, profiles: perfis,
    });
    expect(id).toEqual({ kind: 'agent', name: AGENT_SENDER_FALLBACK, avatarUrl: null });
  });

  it('agent_id setado mas currentUserId nulo nao vira "Você": continua outro atendente', () => {
    const id = resolveSenderIdentity({
      item: { sender: 'agent', agentId: EU }, currentUserId: null, contact: null, profiles: perfis,
    });
    expect(id.kind).toBe('agent');
    expect(id.name).toBe('Joaquim Ataides');
  });

  it('nome vazio cai no apelido; sem os dois, "Atendente"', () => {
    expect(senderProfileName(perfis['prof-sem-nome'])).toBe('Juca');
    expect(resolveSenderIdentity({
      item: { sender: 'agent', agentId: 'prof-sem-nome' }, currentUserId: EU, contact: null, profiles: perfis,
    }).name).toBe('Juca');

    expect(senderProfileName(perfis['prof-vazio'])).toBe(AGENT_SENDER_FALLBACK);
    expect(senderProfileName(undefined)).toBe(AGENT_SENDER_FALLBACK);
  });

  it('sender="agent" sem agent_id (celular/automacao) vira "Equipe" sem foto', () => {
    expect(resolveSenderIdentity({
      item: { sender: 'agent', agentId: null }, currentUserId: EU, contact: CONTATO, profiles: perfis,
    })).toEqual({ kind: 'team', name: TEAM_SENDER_NAME, avatarUrl: null });
  });

  it('sender desconhecido/nulo (registro legado) tambem cai em "Equipe"', () => {
    expect(resolveSenderIdentity({
      item: { sender: null, agentId: null }, currentUserId: EU, contact: null, profiles: null,
    })).toEqual({ kind: 'team', name: TEAM_SENDER_NAME, avatarUrl: null });
  });

  it('nunca lanca nem devolve nome vazio, seja qual for a combinacao', () => {
    const combinacoes = [
      { sender: 'contact', agentId: null },
      { sender: 'agent', agentId: null },
      { sender: null, agentId: null },
      { sender: 'agent', agentId: 'x' },
      { sender: 'contact', agentId: EU },
    ];
    for (const item of combinacoes) {
      const id = resolveSenderIdentity({ item, currentUserId: EU, contact: null, profiles: null });
      expect(id.name.trim().length).toBeGreaterThan(0);
      expect(['self', 'agent', 'contact', 'team']).toContain(id.kind);
    }
  });
});

describe('initialsOf', () => {
  it('usa a inicial das duas primeiras palavras', () => {
    expect(initialsOf('Joaquim Ataides')).toBe('JA');
    expect(initialsOf('Maria Souza Lima')).toBe('MS');
    expect(initialsOf('Você')).toBe('V');
    expect(initialsOf('Equipe')).toBe('E');
  });

  it('nome vazio, nulo ou so espacos devolve string vazia', () => {
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
    expect(initialsOf(null)).toBe('');
    expect(initialsOf(undefined)).toBe('');
  });
});

describe('stableColorOf', () => {
  it('mesma pessoa = mesma cor (independe do nome)', () => {
    expect(stableColorOf(OUTRO)).toEqual(stableColorOf(OUTRO));
    expect(stableColorOf('prof-1')).toEqual(stableColorOf('prof-1'));
    expect(stableColorOf(OUTRO).bg).toBeTruthy();
    expect(stableColorOf(OUTRO).text).toBeTruthy();
  });

  it('pessoas diferentes tendem a cores diferentes', () => {
    expect(stableColorOf('prof-1')).not.toEqual(stableColorOf('prof-3'));
  });

  it('sem id devolve uma cor valida (nunca lanca)', () => {
    for (const vazio of [null, undefined, '', '   ']) {
      expect(stableColorOf(vazio).bg).toBeTruthy();
      expect(stableColorOf(vazio).text).toBeTruthy();
    }
  });
});
