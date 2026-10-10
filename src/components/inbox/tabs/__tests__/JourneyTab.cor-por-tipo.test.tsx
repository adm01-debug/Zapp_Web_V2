import { describe, expect, it, vi } from 'vitest';

// O módulo importa o hook do histórico (que importa o cliente Supabase); aqui só lemos o mapa de
// cores, então o cliente vira um dublê para o import não tocar a rede.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({}) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
  },
}));

import { KIND_META } from '@/components/inbox/tabs/JourneyTab';
import type { TimelineEventKind } from '@/hooks/chat/useConversationHistoryTimeline';

/** Os 11 tipos de evento que a linha do tempo do Journey pode renderizar. */
const TIPOS: TimelineEventKind[] = [
  'message_in',
  'message_out',
  'note',
  'transfer',
  'assign',
  'file',
  'task',
  'deal',
  'close',
  'reopen',
  'call',
];

/**
 * Agrupamento visual decidido no cartão t_c3b81d90: os dois sentidos de MENSAGEM são o mesmo
 * evento (ícone e cor únicos) e ENCERRAMENTO/REABERTURA são a mesma coisa (Atendimento). Todo par
 * de grupos DIFERENTES tem que ter token diferente — é o que "cor própria por tipo" exige.
 */
const GRUPO: Record<TimelineEventKind, string> = {
  message_in: 'mensagem',
  message_out: 'mensagem',
  note: 'nota',
  transfer: 'transferencia',
  assign: 'atribuicao',
  file: 'arquivo',
  task: 'tarefa',
  deal: 'proposta',
  close: 'atendimento',
  reopen: 'atendimento',
  call: 'ligacao',
};

/** Tokens de cor do sistema (docs/design + tailwind.config.ts). Sem hex, sem rgb/hsl. */
const TOKENS = [
  'primary',
  'info',
  'success',
  'warning',
  'destructive',
  'muted',
  'muted-foreground',
  'violeta',
  'teal',
  'rosa',
  'background',
  'foreground',
  'border',
];

/** Extrai o token de cor de `text-<token>` de uma className `bg-<token>/NN text-<token>`. */
const tokenDe = (classe: string): string =>
  /(?:^|\s)text-([a-z-]+?)(?:\/\d+)?(?:\s|$)/.exec(classe)?.[1] ?? '';

describe('KIND_META — cor própria por tipo de evento (t_62365cff)', () => {
  it('cobre os 11 tipos de evento do TimelineEventKind', () => {
    expect(Object.keys(KIND_META).sort()).toEqual([...TIPOS].sort());
  });

  it('usa só tokens do sistema, sem hex/rgb/hsl nas classes', () => {
    for (const tipo of TIPOS) {
      const { className } = KIND_META[tipo];
      expect(className, tipo).toMatch(/^bg-[a-z-]+\/\d+ text-[a-z-]+$/);
      expect(TOKENS, `${tipo}: ${className}`).toContain(tokenDe(className));
      expect(className, tipo).not.toMatch(/#|rgb\(|hsl\(/);
    }
  });

  it('nenhum par de tipos de grupos diferentes compartilha o token de cor', () => {
    const donoDoToken = new Map<string, string>();
    for (const tipo of TIPOS) {
      const token = tokenDe(KIND_META[tipo].className);
      expect(token, tipo).not.toBe('');
      const grupo = GRUPO[tipo];
      const jaUsado = donoDoToken.get(token);
      // se o token já tem dono, tem que ser o MESMO grupo (mensagem/atendimento) — nunca outro tipo
      if (jaUsado !== undefined) {
        expect(jaUsado, `token "${token}" dividido por ${tipo} (${grupo}) e ${jaUsado}`).toBe(grupo);
      }
      donoDoToken.set(token, grupo);
    }
  });

  it('os dois sentidos de mensagem e encerrado/reaberto dividem o par por desenho', () => {
    expect(KIND_META.message_in.className).toBe(KIND_META.message_out.className);
    expect(KIND_META.close.className).toBe(KIND_META.reopen.className);
  });
});
