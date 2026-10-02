import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '..', '..');

// Varredura axe (4.13, Chromium real, app logado) da tela de configuracoes:
// 3 achados persistentes nos 4 estados de tema. Um deles e de componente e esta travado aqui:
// o Popover do menu do perfil e renderizado como role="dialog" e nao tinha nome acessivel
// (regra aria-dialog-name, impacto serio) — quem usa leitor de tela ouve "dialogo" sem saber
// qual. Os outros dois sao de tema/shell e estao registrados em ~/evidencias/axe-telas/configuracoes.md
// (familia --destructive: banner de conexao 3,78:1 claro / 3,00:1 escuro; e 'region' do shell).

describe('axe — tela de configuracoes: nome acessivel no menu do perfil', () => {
  it('o PopoverContent do SidebarUserPill tem aria-label', () => {
    const arquivo = readFileSync(resolve(raiz, 'src/components/layout/SidebarUserPill.tsx'), 'utf8');
    const bloco = arquivo.match(/<PopoverContent[\s\S]{0,400}?>/)?.[0] ?? '';
    expect(bloco).not.toBe('');
    expect(bloco).toMatch(/aria-label=/);
  });
});
