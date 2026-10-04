import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '..', '..');

// Varredura axe (4.13) da view talkx (rotulo "Campanhas"): aria-required-children [critical]
// acusava "Element has children which are not allowed: button[aria-haspopup]" — os dois
// <DropdownMenu> (Analytics, Templates) estavam DENTRO do <TabsList>, e o button com
// aria-haspopup nao e filho valido de role="tablist". Os menus passaram a ser irmaos do tablist.

describe('axe — view talkx: tablist sem filhos proibidos', () => {
  it('nenhum DropdownMenu dentro do TabsList', () => {
    const v = readFileSync(resolve(raiz, 'src/components/talkx/TalkXView.tsx'), 'utf8');
    const bloco = v.match(/<TabsList[\s\S]*?<\/TabsList>/)?.[0] ?? '';
    expect(bloco).not.toBe('');
    expect(bloco).not.toMatch(/DropdownMenu/);
    expect(bloco).toMatch(/<TabsTrigger/);
  });


  it('os filtros de campanha anunciam o proprio rotulo (combobox com nome)', () => {
    const v = readFileSync(resolve(raiz, 'src/components/talkx/kit/filters.tsx'), 'utf8');
    const i = v.indexOf('min-w-[120px]');
    expect(i).toBeGreaterThan(-1);
    expect(v.slice(Math.max(0, i - 200), i)).toMatch(/aria-label=\{fd\.label\}/);
  });

  it('os dois menus continuam na tela', () => {
    const v = readFileSync(resolve(raiz, 'src/components/talkx/TalkXView.tsx'), 'utf8');
    expect((v.match(/<DropdownMenu>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
