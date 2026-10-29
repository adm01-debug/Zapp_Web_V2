/**
 * Contrato do consumidor da variável `--chat-font-size`.
 *
 * O controle da Aparência escreve `--chat-font-size` no <html>; quem lê é a classe
 * `.chat-message-text`, usada pelo texto dos balões REAIS (MessageBubble.tsx). Sem esta
 * classe a variável não teria efeito nenhum e a escolha do usuário seria decorativa.
 *
 * Sem variável definida o valor precisa continuar sendo 0.875rem (o `text-sm` de antes),
 * para a tela não mudar para quem nunca escolheu; e a regra NÃO pode usar `!important`,
 * senão venceria o modo "Texto Grande" do alto contraste (accessibility.css usa
 * `!important` justamente para ele ganhar).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentes = readFileSync('src/styles/components.css', 'utf8');
const acessibilidade = readFileSync('src/styles/accessibility.css', 'utf8');

function bloco(css: string, seletor: string): string {
  return css.match(new RegExp(`${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('components.css — o texto do balão lê --chat-font-size', () => {
  it('a classe .chat-message-text usa a variável com o padrão text-sm', () => {
    const regra = bloco(componentes, '.chat-message-text');
    expect(regra).toMatch(/font-size:\s*var\(--chat-font-size,\s*0\.875rem\)\s*;/);
  });

  it('a regra não usa !important (o Texto Grande do alto contraste continua ganhando)', () => {
    const regra = bloco(componentes, '.chat-message-text');
    expect(regra).not.toContain('!important');
    expect(acessibilidade).toMatch(
      /\.large-text\s+:where\(\*\):not\(svg,\s*svg \*, path\)\s*\{[^}]*font-size:[^}]*!important/,
    );
  });
});
