import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Clique-para-discar (etapa T29): prova a FIACAO das origens ao contrato unificado.
 *
 * Por que le a fonte e nao renderiza: o que a etapa mudou e a origem do evento, e um
 * teste de render das 3 origens exigiria montar a arvore inteira do inbox (conversa,
 * dialogs, midia). O repositorio ja usa este estilo para contratos de fiacao
 * (`calls-access.test.ts`). O comportamento do contrato em si esta coberto por
 * `events.test.ts` (16 casos), e o consumidor por `CallSessionProvider.test.tsx`.
 *
 * Divergencia registrada do plano: ele nomeia `ChatHeader` como origem, mas ali a
 * prop so e repassada — quem de fato emite no inbox e o `ChatPanel` (`:247`).
 */
const raiz = process.cwd();
const ler = (rel: string): string => readFileSync(path.join(raiz, rel), 'utf8');

const EMISSORES = [
  ['ContactActionButtons', 'src/components/inbox/contact-details/ContactActionButtons.tsx'],
  ['ChatPanel', 'src/components/inbox/ChatPanel.tsx'],
] as const;

const HOSPEDEIROS = [
  ['ContactHeaderSection', 'src/components/inbox/contact-details/ContactHeaderSection.tsx'],
  ['ChatHeader', 'src/components/inbox/chat/ChatHeader.tsx'],
] as const;

describe('clique-para-discar — as origens migradas (T29)', () => {
  it.each(EMISSORES)('%s importa o contrato unificado', (_nome, arquivo) => {
    expect(ler(arquivo)).toContain('@/lib/calls/events');
  });

  it.each(EMISSORES)('%s chama dispatchStartCall', (_nome, arquivo) => {
    expect(ler(arquivo)).toMatch(/dispatchStartCall\(\{/);
  });

  it.each([...EMISSORES, ...HOSPEDEIROS])('%s nao emite mais o evento legado por window', (_nome, arquivo) => {
    expect(ler(arquivo)).not.toContain('start-voip-call');
  });

  it.each([...EMISSORES, ...HOSPEDEIROS])('%s nao abre mais o CallDialog antigo', (_nome, arquivo) => {
    const fonte = ler(arquivo);
    expect(fonte).not.toContain('showCallDialog');
    expect(fonte).not.toContain("openDialog('callDialog')");
  });

  it('o WhatsApp tambem passa pelo contrato (nao ficou dependendo do dialogo que saiu)', () => {
    const btn = ler('src/components/inbox/contact-details/ContactActionButtons.tsx');
    expect(btn).toContain("channel: 'whatsapp'");
    expect(btn).toContain("channel: 'voip'");
  });

  it('o payload leva a origem declarada', () => {
    for (const [, arquivo] of EMISSORES) {
      expect(ler(arquivo)).toContain("source: 'inbox'");
    }
  });

  it('o consumidor UNICO vive no provider e assina o contrato', () => {
    const prov = ler('src/providers/CallSessionProvider.tsx');
    expect(prov).toContain('onStartCall');
    expect(prov).toContain('numeroPendente');
    // Quem despacha sao as ORIGENS; o provider e o unico que ASSINA o contrato.
    expect(prov).not.toContain('start-voip-call');
  });

  it('C02 — as origens do inbox levam o avatar do contato no payload', () => {
    expect(ler('src/components/inbox/contact-details/ContactActionButtons.tsx')).toContain('avatar: contact.avatar');
    expect(ler('src/components/inbox/ChatPanel.tsx')).toContain('avatar: conversation.contact.avatar');
  });

  it('C02 — o provider registra o pedido do inbox como chamadaSaida (o cartao disca sem navegar)', () => {
    const prov = ler('src/providers/CallSessionProvider.tsx');
    expect(prov).toContain('chamadaSaida');
    expect(prov).toContain('limparChamadaSaida');
  });

  it('ninguem mais emite o legado no app (fora da constante e dos testes)', () => {
    const prov = ler('src/providers/CallSessionProvider.tsx');
    expect(prov).not.toContain('start-voip-call');
    for (const [, arquivo] of [...EMISSORES, ...HOSPEDEIROS]) {
      expect(ler(arquivo)).not.toContain('start-voip-call');
    }
  });
});
