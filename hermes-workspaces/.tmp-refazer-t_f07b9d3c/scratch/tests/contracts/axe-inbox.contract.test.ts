import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato da varredura de acessibilidade (axe-core 4.13) da tela INBOX/CHAT.
 *
 * Evidência crua da medição (app logado, Chromium real, 4 estados de tema):
 *   ~/evidencias/axe-telas/inbox.json  (resumo: inbox.md)
 *
 * Números medidos que estas correções fecham, e o que ficou de fora por decisão:
 *   avatar "QH" (bg-primary/15 + text-primary)      3,84 claro / 2,87 escuro / 3,23 HC-escuro
 *       -> corrigido com chip invertido (surface --primary-foreground, tinta --primary)
 *   banner de conexão (branco sobre --destructive)  3,78 claro / 3,00 escuro
 *       -> NÃO corrigido: é o par do token; fechar exige mexer em --destructive (vetado)
 *   botão "reconectar" (branco sobre destructive-foreground/20)
 *                                                   2,99 claro / 2,45 escuro / 3,91 HC-escuro
 *       -> NÃO corrigido: mesma raiz (remover o alfa não alcança 4,5:1 sem mudar o token)
 *   chip de status (bg-accent + text-foreground)    2,39 no alto contraste
 *       -> NÃO corrigido: par do token --accent (vetado)
 */
const raiz = resolve(__dirname, '../..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

describe('contrato: acessibilidade da tela de inbox/chat (axe)', () => {
  const sidebar = ler('src/components/layout/Sidebar.tsx');
  const pill = ler('src/components/layout/SidebarUserPill.tsx');
  const modal = ler('src/components/onboarding/WelcomeModal.tsx');
  const indicador = ler('src/components/inbox/NewMessageIndicator.tsx');

  it('o menu principal é <nav>, não <aside role="navigation"> (papel não permitido no aside)', () => {
    expect(sidebar).toMatch(/<nav id="main-navigation" aria-label="Menu de navegação principal"/);
    expect(sidebar).not.toMatch(/<aside id="main-navigation"/);
    expect(sidebar).not.toMatch(/<aside id="main-navigation"[^>]*role="navigation"/);
  });

  it('o avatar não pinta --primary sobre bg-primary/15 (2,87:1 no escuro)', () => {
    expect(pill).not.toMatch(/bg-primary\/15\s+text-primary/);
    expect(pill).toMatch(/bg-primary-foreground text-primary text-2xs font-semibold/);
  });

  it('o botão de fechar do modal de boas-vindas tem nome acessível', () => {
    expect(modal).toMatch(/aria-label="Fechar"[\s\S]{0,120}absolute top-4 right-4 p-2 rounded-full/);
  });

  it('o botão icon-only de dispensar o aviso de novas mensagens tem nome acessível', () => {
    expect(indicador).toMatch(
      /aria-label="Dispensar aviso de novas mensagens"[\s\S]{0,120}className="w-6 h-6 hover:bg-muted\/50"/,
    );
  });
});
