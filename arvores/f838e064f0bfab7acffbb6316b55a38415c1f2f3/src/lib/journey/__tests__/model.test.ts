import { describe, it, expect } from 'vitest';
import type { LucideIcon } from 'lucide-react';
import {
  CATEGORY_META,
  KIND_TO_CATEGORY,
  TYPE_FILTER_OPTIONS,
  formatDayLabel,
  safeEventText,
} from '@/lib/journey/model';
import type { JourneyCategory, JourneyKind } from '@/lib/journey/model';

/**
 * Valores do modelo escritos à mão: o tipo do TypeScript não existe em tempo de execução,
 * então é esta lista que acusa um `kind`/categoria novo que ficou fora dos mapas.
 */
const ALL_CATEGORIES: JourneyCategory[] = [
  'message', 'email', 'call', 'note', 'task', 'transfer', 'file', 'deal', 'case',
];

const ALL_KINDS: JourneyKind[] = [
  'message_in', 'message_out',
  'email_in', 'email_out',
  'call_in', 'call_out', 'call_missed',
  'note',
  'task_created', 'task_started', 'task_done', 'task_overdue',
  'transfer', 'assign', 'unassign',
  'file_in', 'file_out',
  'deal_created', 'deal_activity',
  'case_closed', 'case_reopened',
];

/** Tokens de cor que o sistema já tem (tailwind.config.ts + src/styles/tokens.css). */
const SYSTEM_TOKENS = [
  'primary', 'success', 'warning', 'info', 'destructive',
  'muted', 'muted-foreground', 'background', 'foreground', 'border', 'card',
];

/** Cores literais do Tailwind — decisão do dono (D02): nenhuma cor nova entra aqui. */
const TAILWIND_LITERAL_COLORS = [
  'sky', 'orange', 'pink', 'teal', 'rose', 'violet', 'purple', 'red', 'green',
  'blue', 'amber', 'yellow', 'indigo', 'fuchsia', 'cyan', 'lime', 'emerald',
  'slate', 'gray', 'grey', 'zinc', 'neutral', 'stone',
];

/** Acusa o primeiro token de classe fora do conjunto do sistema (e devolve `null` se estiver tudo certo). */
function primeiroTokenForaDoSistema(classes: string): string | null {
  for (const token of classes.split(/\s+/).filter(Boolean)) {
    const m = /^(bg|text|border)-([a-z-]+?)(\/\d+)?$/.exec(token);
    if (!m) return token;
    const nome = m[2];
    if (TAILWIND_LITERAL_COLORS.includes(nome) || !SYSTEM_TOKENS.includes(nome)) return token;
  }
  return null;
}

describe('KIND_TO_CATEGORY', () => {
  it('cobre todos os tipos finos e só eles', () => {
    expect(Object.keys(KIND_TO_CATEGORY).sort()).toEqual([...ALL_KINDS].sort());
    for (const kind of ALL_KINDS) {
      expect(ALL_CATEGORIES).toContain(KIND_TO_CATEGORY[kind]);
    }
  });
});

describe('CATEGORY_META', () => {
  it('cobre todas as categorias e só elas', () => {
    expect(Object.keys(CATEGORY_META).sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  it('toda categoria tem rótulo, ícone e as três classes preenchidas', () => {
    for (const category of ALL_CATEGORIES) {
      const meta = CATEGORY_META[category];
      expect(meta).toBeDefined();
      expect(meta.label.trim()).not.toBe('');
      // componente do lucide-react (forwardRef: 'object' nas versões atuais, 'function' se virar função pura)
      expect(['function', 'object']).toContain(typeof meta.icon);
      for (const classe of [meta.iconClass, meta.railClass, meta.badgeClass]) {
        expect(classe.trim()).not.toBe('');
      }
    }
  });

  it('cada categoria tem rótulo e ícone ÚNICOS (a cor é compartilhada, o rótulo e o ícone não)', () => {
    const rotulos = ALL_CATEGORIES.map((c) => CATEGORY_META[c].label);
    expect(new Set(rotulos).size).toBe(rotulos.length);

    const icones = ALL_CATEGORIES.map((c) => CATEGORY_META[c].icon as LucideIcon);
    expect(new Set(icones).size).toBe(icones.length);
  });

  it('usa só as classes de cor do sistema (sem cor literal do Tailwind e sem token inexistente)', () => {
    for (const category of ALL_CATEGORIES) {
      const meta = CATEGORY_META[category];
      for (const classe of [meta.iconClass, meta.railClass, meta.badgeClass]) {
        expect(primeiroTokenForaDoSistema(classe), `${category}: ${classe}`).toBeNull();
      }
    }
  });

  it('o validador acima reprova cor literal (controle negativo: o teste não pode ser vazio)', () => {
    expect(primeiroTokenForaDoSistema('bg-primary/15 text-primary')).toBeNull();
    expect(primeiroTokenForaDoSistema('bg-muted/60 text-muted-foreground')).toBeNull();
    expect(primeiroTokenForaDoSistema('bg-sky-500/15 text-sky-500')).toBe('bg-sky-500/15');
    expect(primeiroTokenForaDoSistema('text-orange-500')).toBe('text-orange-500');
    expect(primeiroTokenForaDoSistema('bg-brand/15')).toBe('bg-brand/15');
  });

  it('segue o mapa de cores decidido pelo dono (D02) com os tokens que já existem', () => {
    // Mensagens, Notas, E-mail, Telefone, Tarefas, Transferências, Arquivos, Propostas, Atendimento.
    // Notas: nenhum violeta do sistema fecha contraste como texto/ícone nos DOIS temas
    // (`--dash-violet` 3,38:1 sobre o card claro e 2,85:1 sobre a própria tinta /15;
    // `--dash-tile-violet` 1,65:1 sobre o card escuro) — o cartão autoriza o `primary`, que é o
    // par que o `KIND_META` da aba já usa; a medição está no relato do cartão.
    expect(CATEGORY_META.message.iconClass).toBe('bg-primary/15 text-primary');
    expect(CATEGORY_META.note.iconClass).toBe('bg-primary/15 text-primary');
    expect(CATEGORY_META.email.iconClass).toBe('bg-info/15 text-info');
    expect(CATEGORY_META.call.iconClass).toBe('bg-success/15 text-success');
    expect(CATEGORY_META.task.iconClass).toBe('bg-warning/15 text-warning');
    expect(CATEGORY_META.transfer.iconClass).toBe('bg-success/15 text-success');
    expect(CATEGORY_META.file.iconClass).toBe('bg-muted/60 text-muted-foreground');
    expect(CATEGORY_META.deal.iconClass).toBe('bg-success/15 text-success');
    expect(CATEGORY_META.case.iconClass).toBe('bg-muted/60 text-muted-foreground');

    // Trilho e selo usam o MESMO token do texto do ícone: nenhuma categoria muda de cor entre o
    // tile, o ponto do trilho e o selo, e nenhuma classe sai desse mapa.
    const tokenDoIcone = (classe: string) => /text-([a-z-]+)$/.exec(classe)?.[1] ?? classe;
    for (const category of ALL_CATEGORIES) {
      const meta = CATEGORY_META[category];
      const token = tokenDoIcone(meta.iconClass);
      expect(meta.railClass, category).toBe(`bg-${token}`);
      if (token === 'muted-foreground') {
        // o par "sem cor" do sistema (mesmo `PILL_CLASS.muted` da aba): fundo neutro, texto secundário
        expect(meta.badgeClass, category).toBe('bg-muted text-muted-foreground border-border');
      } else {
        expect(meta.badgeClass, category).toBe(`bg-${token}/15 text-${token} border-${token}/30`);
      }
    }
  });
});

describe('TYPE_FILTER_OPTIONS', () => {
  it('lista, na ordem do cartão, Todos + todas as categorias', () => {
    expect(TYPE_FILTER_OPTIONS).toEqual([
      { value: 'all', label: 'Todos' },
      { value: 'message', label: 'Mensagens' },
      { value: 'email', label: 'E-mail' },
      { value: 'call', label: 'Telefone' },
      { value: 'note', label: 'Notas' },
      { value: 'task', label: 'Tarefas' },
      { value: 'transfer', label: 'Transferências' },
      { value: 'file', label: 'Arquivos' },
      { value: 'deal', label: 'Propostas' },
      { value: 'case', label: 'Atendimento' },
    ]);
  });
});

describe('formatDayLabel — data do histórico no fuso local', () => {
  const agora = new Date(2026, 9, 7, 15, 30); // 07/10/2026 15:30 local

  it('hoje', () => {
    expect(formatDayLabel('2026-10-07', agora)).toBe('Hoje, 7 de outubro de 2026');
  });

  it('ontem', () => {
    expect(formatDayLabel('2026-10-06', agora)).toBe('Ontem, 6 de outubro de 2026');
  });

  it('dia mais antigo sai sem prefixo', () => {
    expect(formatDayLabel('2026-09-30', agora)).toBe('30 de setembro de 2026');
    expect(formatDayLabel('2026-01-05', agora)).toBe('5 de janeiro de 2026');
  });

  it('virada de mês', () => {
    expect(formatDayLabel('2026-10-31', new Date(2026, 10, 1, 0, 5))).toBe('Ontem, 31 de outubro de 2026');
    expect(formatDayLabel('2026-10-31', new Date(2026, 10, 3, 12, 0))).toBe('31 de outubro de 2026');
  });

  it('virada de ano', () => {
    expect(formatDayLabel('2026-12-31', new Date(2027, 0, 1, 8, 0))).toBe('Ontem, 31 de dezembro de 2026');
  });

  it('não escreve "De" maiúsculo (defeito do rótulo com a classe `capitalize`)', () => {
    const rotulos = [
      formatDayLabel('2026-10-07', agora),
      formatDayLabel('2026-10-06', agora),
      formatDayLabel('2026-09-30', agora),
    ];
    for (const rotulo of rotulos) {
      expect(rotulo).not.toMatch(/De/);
      expect(rotulo).toContain(' de ');
    }
  });

  it('data inválida devolve string vazia', () => {
    expect(formatDayLabel('', agora)).toBe('');
    expect(formatDayLabel('30/09/2026', agora)).toBe('');
    expect(formatDayLabel('2026-10', agora)).toBe('');
    expect(formatDayLabel('nao-e-data', agora)).toBe('');
  });

  it('instante ISO completo usa o dia no fuso local', () => {
    // Mesma regra do `localDay`: o dia é o do relógio do usuário, não a fatia UTC do ISO.
    const instante = new Date(2026, 9, 6, 22, 30).toISOString();
    expect(formatDayLabel(instante, agora)).toBe('Ontem, 6 de outubro de 2026');
  });
});

describe('safeEventText — nada de JSON cru na timeline', () => {
  const localizacaoDoPrint =
    '{"latitude":-23.56672978,"longitude":-46.61563441,"name":"XBZ Brindes","address":"R. da Independência, São Paulo"}';

  it('mensagem de localização vira nome + endereço', () => {
    expect(safeEventText(localizacaoDoPrint)).toBe(
      'Localização: XBZ Brindes — R. da Independência, São Paulo',
    );
  });

  it('localização sem nome mostra só o que tem', () => {
    expect(safeEventText('{"latitude":-23.5,"longitude":-46.6}')).toBe('Localização');
    expect(safeEventText('{"latitude":-23.5,"longitude":-46.6,"address":"Av. Paulista, 1000"}')).toBe(
      'Localização: Av. Paulista, 1000',
    );
  });

  it('JSON desconhecido ou quebrado nunca aparece cru', () => {
    expect(safeEventText('{"foo":"bar"}')).toBe('Conteúdo estruturado');
    expect(safeEventText('{"latitude":-23.5,')).toBe('Conteúdo estruturado');
    expect(safeEventText('{"latitude":-23.5,"longitude":-46.6,"name":"XBZ"')).toBe('Conteúdo estruturado');
  });

  it('áudio, sticker e contato recebem rótulo próprio', () => {
    expect(safeEventText('{"seconds":15}', 'ptt')).toBe('Áudio');
    expect(safeEventText('qualquer coisa', 'audio')).toBe('Áudio');
    expect(safeEventText('', 'sticker')).toBe('Sticker');
    expect(safeEventText('BEGIN:VCARD', 'vcard')).toBe('Contato compartilhado');
  });

  it('texto normal tem espaços normalizados e corte de 120 caracteres', () => {
    expect(safeEventText('  oi,   tudo\nbem?  ')).toBe('oi, tudo bem?');

    const exato = 'a'.repeat(120);
    expect(safeEventText(exato)).toBe(exato);
    expect(safeEventText(exato)).toHaveLength(120);

    const longo = safeEventText(`${'palavra '.repeat(30)}fim`);
    expect(longo.endsWith('…')).toBe(true);
    expect(longo.length).toBeLessThanOrEqual(121);
    expect(longo.startsWith('palavra palavra')).toBe(true);
  });

  it('vazio devolve string vazia', () => {
    expect(safeEventText('')).toBe('');
    expect(safeEventText('   ')).toBe('');
    expect(safeEventText(null)).toBe('');
    expect(safeEventText(undefined)).toBe('');
  });
});
