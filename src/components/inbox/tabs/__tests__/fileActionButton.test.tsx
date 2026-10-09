import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { FileCard } from '../FileCard';
import { FILE_ACTION_BUTTON, FILE_ACTION_BUTTON_DISABLED } from '../fileActionButton';

/**
 * A07a — área de toque dos botões de ação do cartão de arquivo no celular.
 *
 * Este teste guarda três coisas da classe compartilhada: (1) o botão VISÍVEL
 * continua de 28 px; (2) a área clicável só cresce sob ponteiro de toque —
 * `(pointer: coarse)`, o mesmo critério de `src/components/tasks/shared/pointerMedia.ts`
 * —, então no mouse nada muda; e (3) ela chega a 44 px de altura sem invadir o
 * vizinho (o vão entre os botões é de 4 px). A geometria é conferida na classe;
 * a prova na tela, com toque emulado, é a etapa A07b.
 */

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

const PASTA = resolve(__dirname, '..');

/** Os arquivos que repetiam a classe do botão de 28 px (6 botões em 5 arquivos). */
const CONSUMIDORES = [
  'AudioPlayButton.tsx',
  'FileActionsMenu.tsx',
  'FileCard.tsx',
  'FilesListView.tsx',
  'FilesTableView.tsx',
];

/** O começo da classe que estava copiado em cada um deles. */
const CLASSE_ANTIGA = 'w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground';
const SOB_PONTEIRO_DE_TOQUE = '[@media(pointer:coarse)]:';

const ITEM: ContactMediaItem = {
  id: 'm1',
  url: 'https://x/planilha.png',
  type: 'image',
  filename: 'IMG-20260924-WA0031.jpg',
  displayName: 'planilha-total.png',
  extension: 'png',
  senderLabel: 'Atendente',
  created_at: '2026-09-24T17:54:00.000Z',
  caption: null,
  mimetype: 'image/png',
  size: 1200000,
  meta: null,
  sender: 'agent',
  signedUrl: 'https://signed.test/planilha.png',
};

function ler(arquivo: string): string {
  return readFileSync(join(PASTA, arquivo), 'utf8');
}

function utilitarios(classe: string): string[] {
  return classe.split(/\s+/).filter(Boolean);
}

/** Tailwind: 1 = 0,25rem = 4px (raiz de 16px) — logo h-11 = 44px e w-8 = 32px. */
function medir(utilitario: string | undefined): number {
  const medida = utilitario?.match(/(?:^|:)[hw]-(\d+)$/);
  if (!medida) throw new Error(`utilitário sem medida: ${utilitario}`);
  return Number(medida[1]) * 4;
}

const semEspaco = (texto: string) => texto.replace(/\s+/g, '');

beforeEach(() => localStorage.clear());

describe('FILE_ACTION_BUTTON (A07a)', () => {
  it('mantém o botão de 28 px e o resto da classe que já existia', () => {
    const classe = utilitarios(FILE_ACTION_BUTTON);

    for (const utilitario of [
      'relative',
      'w-7',
      'h-7',
      'rounded-md',
      'flex',
      'items-center',
      'justify-center',
      'text-muted-foreground',
      'hover:bg-muted',
      'hover:text-foreground',
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-ring',
    ]) {
      expect(classe).toContain(utilitario);
    }
    expect(medir(classe.find((u) => u.startsWith('w-')))).toBe(28);
    expect(medir(classe.find((u) => u.startsWith('h-')))).toBe(28);
  });

  it('a extensão de toque existe, e só sob ponteiro de toque', () => {
    const classe = utilitarios(FILE_ACTION_BUTTON);
    const extensao = classe.filter((utilitario) => utilitario.includes(':after:'));

    expect(extensao.length).toBeGreaterThan(0);
    // nenhuma regra de ::after fora do @media: no mouse o botão é o mesmo de hoje
    expect(extensao.every((utilitario) => utilitario.startsWith(SOB_PONTEIRO_DE_TOQUE))).toBe(true);
    // e nada dentro do @media fora do ::after (a extensão não mexe no botão visível)
    expect(
      classe.filter((u) => u.startsWith(SOB_PONTEIRO_DE_TOQUE)).every((u) => u.includes(':after:')),
    ).toBe(true);
  });

  it('usa o mesmo critério de ponteiro de toque do projeto', () => {
    const criterioDoProjeto = ler('../../tasks/shared/pointerMedia.ts');
    expect(semEspaco(criterioDoProjeto)).toContain(semEspaco('(pointer: coarse)'));
    expect(semEspaco(FILE_ACTION_BUTTON)).toContain(semEspaco('(pointer: coarse)'));
  });

  it('chega a 44 px de altura e 32 px de largura, com no máximo 2 px para cada lado', () => {
    const classe = utilitarios(FILE_ACTION_BUTTON);
    const altura = medir(classe.find((u) => /:after:h-\d+$/.test(u)));
    const largura = medir(classe.find((u) => /:after:w-\d+$/.test(u)));

    expect(altura).toBeGreaterThanOrEqual(44);
    expect(largura).toBeGreaterThanOrEqual(32);
    // o vizinho fica a 4 px (gap-1): a sobra de cada lado não pode passar de 2 px
    expect((largura - 28) / 2).toBeLessThanOrEqual(2);
    // centrada no botão: cresce igual para os dois lados (horizontal e vertical)
    for (const centralizador of [
      'after:left-1/2',
      'after:top-1/2',
      'after:-translate-x-1/2',
      'after:-translate-y-1/2',
    ]) {
      expect(FILE_ACTION_BUTTON).toContain(SOB_PONTEIRO_DE_TOQUE + centralizador);
    }
  });

  it.each(CONSUMIDORES)('%s importa a constante e não repete a classe', (arquivo) => {
    const fonte = ler(arquivo);

    expect(fonte).toMatch(/import \{[^}]*FILE_ACTION_BUTTON[^}]*\} from '\.\/fileActionButton';/);
    expect(fonte).toContain('className={FILE_ACTION_BUTTON');
    expect(fonte).not.toContain(CLASSE_ANTIGA);
  });

  it('o cartão real usa a constante nos três botões de ação', () => {
    render(
      <FileCard
        item={ITEM}
        contactName="Ana Cliente"
        selected={false}
        onSelect={vi.fn()}
        onToggleSelection={vi.fn()}
        onPreview={vi.fn()}
        onForward={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Visualizar' }).className).toBe(FILE_ACTION_BUTTON);
    expect(screen.getByRole('button', { name: 'Mais ações' }).className).toBe(FILE_ACTION_BUTTON);

    // o "Encaminhar" (desabilitado) mantém o cinza e o ponteiro barrado, sem herdar o hover da base
    const encaminhar = screen.getByRole('button', { name: 'Encaminhar' });
    expect(encaminhar).toBeDisabled();
    expect(encaminhar.className).toBe(FILE_ACTION_BUTTON_DISABLED);
    expect(FILE_ACTION_BUTTON_DISABLED).toContain('disabled:text-muted-foreground/50');
    expect(FILE_ACTION_BUTTON_DISABLED).toContain('cursor-not-allowed');
    expect(FILE_ACTION_BUTTON_DISABLED).toContain('disabled:hover:bg-transparent');
    expect(FILE_ACTION_BUTTON_DISABLED).toContain('disabled:hover:text-muted-foreground/50');
  });
});
