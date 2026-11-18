import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * A visão 360 do CRM externo (empresa, decisores, histórico de interações,
 * canais) tinha hook e tipos na `main` desde sempre — `useExternalContact360` e
 * `types/contact360.ts` — e nenhuma tela. O painel que a renderiza ficou parado
 * numa branch e foi descartado por engano, com o motivo "importa
 * Contact360Helpers, que não existe na main": o helper estava na MESMA branch.
 *
 * Este contrato trava as duas pontas que fazem a diferença entre funcionalidade
 * entregue e código morto:
 *   1. o painel está RENDERIZADO no painel do contato (não só importado);
 *   2. a seção começa RECOLHIDA — o Radix desmonta o conteúdo fechado, então o
 *      CRM externo só é consultado quando o atendente abre. Pôr `crm360` em
 *      DEFAULT_OPEN_SECTIONS faria toda abertura de conversa bater no CRM.
 */
const ler = (caminho: string) => readFileSync(new URL(`../../${caminho}`, import.meta.url), 'utf8');

// O config de contratos não resolve o alias `@/`, então as listas vêm do texto
// do módulo — mesma técnica dos outros contratos que leem `src/`.
const listaDe = (fonte: string, nome: string) => {
  // Ancorado em `export const`: o cabeçalho do módulo MENCIONA os dois nomes em
  // prosa, e sem a âncora o casamento atravessava o comentário e pegava a lista
  // da constante seguinte.
  const m = fonte.match(new RegExp(`export const ${nome}[^=]*=\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`não achei export const ${nome} em sidebarSections.ts`);
  return m[1].split(',').map((v) => v.trim().replace(/^'|'$/g, '')).filter(Boolean);
};

describe('Visão 360 do CRM: seção ligada no painel do contato', () => {
  const contactDetails = ler('src/components/inbox/ContactDetails.tsx');

  it('o painel é importado E renderizado (não basta o import)', () => {
    expect(contactDetails).toContain("from './contact-details/ExternalContact360Panel'");
    expect(contactDetails).toMatch(/<ExternalContact360Panel\s+contactId=\{contact\.id\}\s*\/>/);
  });

  it('o painel fica dentro de uma SidebarSection com value="crm360"', () => {
    // A seção precisa existir no acordeão para que a preferência de aberto/fechado
    // seja persistida junto com as vizinhas.
    const trecho = contactDetails.slice(
      contactDetails.indexOf('value="crm360"'),
      contactDetails.indexOf('value="crm360"') + 400,
    );
    expect(trecho).toContain('<ExternalContact360Panel');
  });

  it('crm360 é um valor conhecido do acordeão', () => {
    const fonte = ler('src/components/inbox/contact-details/sidebar/sidebarSections.ts');
    expect(listaDe(fonte, 'SIDEBAR_SECTIONS')).toContain('crm360');
  });

  it('crm360 começa RECOLHIDA: sem isso toda conversa aberta consultaria o CRM externo', () => {
    const fonte = ler('src/components/inbox/contact-details/sidebar/sidebarSections.ts');
    expect(listaDe(fonte, 'DEFAULT_OPEN_SECTIONS')).not.toContain('crm360');
    // Não-vacuidade: a lista existe e tem conteúdo.
    expect(listaDe(fonte, 'DEFAULT_OPEN_SECTIONS').length).toBeGreaterThan(0);
  });

  it('o painel e o helper que ele usa existem de fato', () => {
    const painel = ler('src/components/inbox/contact-details/ExternalContact360Panel.tsx');
    const helper = ler('src/components/inbox/contact-details/Contact360Helpers.tsx');
    // O painel lê o CRM externo pelo hook que já estava na main.
    expect(painel).toContain("from '@/hooks/crm/useExternalContact360'");
    expect(painel).toContain("from './Contact360Helpers'");
    // Os 12 subcomponentes que o painel consome precisam estar exportados.
    for (const nome of [
      'SectionTitle', 'InfoRow', 'RFMBadge', 'CompanyCard', 'CustomerProfile',
      'ContactDetailCard', 'StakeholderCard', 'InteractionsTimeline', 'SocialLinks',
      'AddressLine', 'ContactChannels', 'BehaviorRadar',
    ]) {
      expect(helper).toContain(`export function ${nome}`);
    }
  });
});
