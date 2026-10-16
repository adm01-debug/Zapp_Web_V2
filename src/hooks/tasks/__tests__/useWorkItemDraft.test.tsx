/**
 * Testes do rascunho do painel de detalhes (etapas 148 e 149).
 *
 * O que fica provado aqui (e que a mutação derruba):
 *  - o patch mínimo só leva o campo que MUDOU, e limpar um campo volta a
 *    contar como "sem alteração" (a comparação é com a base, não com o toque);
 *  - troca de estado vai pelo `move` (limite de Fazendo e motivo obrigatório
 *    pré-validados): bloqueado, NADA é escrito e o rascunho fica de pé;
 *  - erro na escrita NÃO avança a base (o rascunho continua sujo para reenvio);
 *  - atualização remota com rascunho sujo levanta "Esta tarefa mudou" sem
 *    descartar as alterações; com rascunho limpo apenas adota a versão nova;
 *  - a nossa própria escrita não vira "mudou".
 *
 * Sem `any` e sem `@ts-nocheck`. O mock de `sonner` vem do harness
 * compartilhado `@/test/mocks/tarefas`, o mesmo dos outros testes da área.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { supabaseMock as h, resetSupabaseMock } from '@/test/mocks/tarefas';

import {
  useWorkItemDraft,
  buildMinimalPatch,
  fieldsFromItem,
  REMOTE_CHANGE_MESSAGE,
  DRAFT_BLOCK_MESSAGES,
  type UseWorkItemDraftOpts,
} from '@/hooks/tasks/useWorkItemDraft';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

function makeItem(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 't1',
    title: 'Ligar para o cliente',
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    remind_at: null,
    notified_at: null,
    waiting_reason: null,
    position: 0,
    started_at: null,
    status_changed_at: '2026-10-11T10:00:00.000Z',
    completed_at: null,
    contact_id: null,
    created_by: 'u1',
    assigned_to: 'u1',
    created_at: '2026-10-11T10:00:00.000Z',
    updated_at: '2026-10-11T10:00:00.000Z',
    contact: null,
    ...over,
  };
}

function setup(
  item: WorkItem | null,
  extras: { items?: WorkItem[]; now?: () => Date } = {},
) {
  const update = vi.fn().mockResolvedValue(undefined);
  const move = vi.fn().mockResolvedValue(undefined);
  const initialProps: UseWorkItemDraftOpts = {
    item,
    update,
    move,
    items: extras.items,
    now: extras.now,
  };
  const view = renderHook((props: UseWorkItemDraftOpts) => useWorkItemDraft(props), {
    initialProps,
  });
  return { ...view, update, move, initialProps };
}

async function save(view: { result: { current: { save: () => Promise<unknown> } } }) {
  await act(async () => {
    await view.result.current.save();
  });
}

describe('useWorkItemDraft — rascunho e patch mínimo (148/149)', () => {
  beforeEach(resetSupabaseMock);

  it('o rascunho nasce dos campos do item (sem alterações pendentes)', () => {
    const { result } = setup(makeItem({ description: 'Notas' }));
    expect(result.current.draft).toEqual(fieldsFromItem(makeItem({ description: 'Notas' })));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.changedFields).toEqual([]);
  });

  it('sem item o rascunho é null e salvar é no-op', async () => {
    const { result, update, move } = setup(null);
    expect(result.current.draft).toBeNull();
    await save({ result });
    expect(update).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });

  it('patch mínimo: alterar só o título envia SÓ o título', async () => {
    const { result, update, move } = setup(makeItem());
    act(() => result.current.setField('title', 'Enviar orçamento'));
    expect(result.current.changedFields).toEqual(['title']);

    await save({ result });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('t1', { title: 'Enviar orçamento' });
    expect(move).not.toHaveBeenCalled();
  });

  it('limpar o campo volta ao estado anterior: deixa de ser alteração', () => {
    const { result } = setup(makeItem());
    act(() => result.current.setField('title', 'Outro título'));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setField('title', 'Ligar para o cliente'));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.changedFields).toEqual([]);
  });

  it('texto em branco num campo anulável conta como "sem valor" (não vira alteração)', () => {
    const { result } = setup(makeItem({ description: null }));
    act(() => result.current.setField('description', '   '));
    expect(result.current.isDirty).toBe(false);
  });

  it('sem alteração o save é no-op e não escreve nada', async () => {
    const { result, update, move } = setup(makeItem());
    await save({ result });
    expect(update).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });

  it('limpar o prazo manda null no patch (e não oculta o campo)', async () => {
    const item = makeItem({ due_date: '2026-10-12T02:59:00.000Z' });
    const { result, update } = setup(item);
    act(() => result.current.setField('dueDate', null));

    await save({ result });

    expect(update).toHaveBeenCalledWith('t1', { dueDate: null });
  });

  it('buildMinimalPatch não inclui status no patch do update', () => {
    const item = makeItem();
    const draft = { ...fieldsFromItem(item), status: 'doing' as const };
    const { fields, statusChanged } = buildMinimalPatch(draft, fieldsFromItem(item));
    expect(statusChanged).toBe(true);
    expect(fields).toEqual({});
  });
});

describe('useWorkItemDraft — limite e motivo (149)', () => {
  beforeEach(resetSupabaseMock);

  it('mover para Aguardando sem motivo bloqueia e NÃO escreve', async () => {
    const { result, update, move } = setup(makeItem());
    act(() => result.current.setField('status', 'waiting'));
    act(() => result.current.setField('waitingReason', '   '));

    let out: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      out = await result.current.save();
    });

    expect(update).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(out?.ok).toBe(false);
    expect(out?.reason).toBe('waiting_reason_required');
    expect(h.toast.error).toHaveBeenCalledWith(DRAFT_BLOCK_MESSAGES.waiting_reason_required);
    // estado anterior intacto: o rascunho continua sujo para o usuário corrigir
    expect(result.current.isDirty).toBe(true);
    expect(result.current.draft?.status).toBe('waiting');
  });

  it('limite de Fazendo (3) bloqueia o save sem escrever nada', async () => {
    const cheias = [
      makeItem({ id: 'd1', status: 'doing' }),
      makeItem({ id: 'd2', status: 'doing' }),
      makeItem({ id: 'd3', status: 'doing' }),
    ];
    const { result, update, move } = setup(makeItem(), { items: cheias });
    act(() => result.current.setField('status', 'doing'));

    let out: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      out = await result.current.save();
    });

    expect(out?.reason).toBe('wip_full');
    expect(update).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalledWith(DRAFT_BLOCK_MESSAGES.wip_full);
  });

  it('abaixo do limite, a troca de estado vai pelo move e o resto pelo update', async () => {
    const { result, update, move } = setup(makeItem(), { items: [makeItem({ id: 'd1', status: 'doing' })] });
    act(() => result.current.setField('status', 'doing'));
    act(() => result.current.setField('title', 'Começar agora'));
    expect(result.current.changedFields).toEqual(['title', 'status']);

    let out: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      out = await result.current.save();
    });

    expect(out).toMatchObject({ ok: true, moved: true });
    expect(update).toHaveBeenCalledWith('t1', { title: 'Começar agora' });
    expect(move).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      'doing',
      expect.objectContaining({ waitingReason: undefined }),
    );
    // salvo: o rascunho deixa de estar sujo
    expect(result.current.isDirty).toBe(false);
  });

  it('mover para Aguardando COM motivo leva o motivo normalizado no move', async () => {
    const { result, move } = setup(makeItem());
    act(() => result.current.setField('status', 'waiting'));
    act(() => result.current.setField('waitingReason', '  Retorno da transportadora  '));

    await save({ result });

    expect(move).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 'waiting', {
      waitingReason: 'Retorno da transportadora',
    });
  });
});

describe('useWorkItemDraft — erro devolve o estado anterior (149)', () => {
  beforeEach(resetSupabaseMock);

  it('erro na escrita não avança a base e devolve o rascunho sujo', async () => {
    const { result, update } = setup(makeItem());
    update.mockRejectedValueOnce(new Error('permission denied'));
    act(() => result.current.setField('title', 'Não vai salvar'));

    let out: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      out = await result.current.save();
    });

    expect(out?.ok).toBe(false);
    expect(out?.reason).toBe('error');
    expect(result.current.isDirty).toBe(true);
    expect(result.current.draft?.title).toBe('Não vai salvar');
    expect(result.current.saveError).toBe('error');
  });

  it('bloqueio devolvido pelo move (wip_full) vira reason wip_full', async () => {
    const { result, move } = setup(makeItem(), { items: [] });
    move.mockRejectedValueOnce(Object.assign(new Error('wip_full'), { blocked: 'wip_full' }));
    act(() => result.current.setField('status', 'doing'));

    let out: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      out = await result.current.save();
    });

    expect(out?.reason).toBe('wip_full');
    expect(result.current.isDirty).toBe(true);
  });

  it('se update gravou e move falhou, avança só a base dos campos salvos', async () => {
    const { result, update, move } = setup(makeItem(), { items: [] });
    move.mockRejectedValueOnce(Object.assign(new Error('wip_full'), { blocked: 'wip_full' }));
    act(() => result.current.setField('title', 'Título já gravado'));
    act(() => result.current.setField('status', 'doing'));

    let out: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      out = await result.current.save();
    });

    expect(update).toHaveBeenCalledWith('t1', { title: 'Título já gravado' });
    expect(move).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 'doing', {
      waitingReason: undefined,
    });
    expect(out).toMatchObject({ ok: false, partialSaved: true, reason: 'wip_full' });
    expect(result.current.changedFields).toEqual(['status']);
    expect(result.current.draft?.title).toBe('Título já gravado');
    expect(result.current.isDirty).toBe(true);
  });
});

describe('useWorkItemDraft — aviso "Esta tarefa mudou" (148)', () => {
  beforeEach(resetSupabaseMock);

  it('atualização remota com rascunho sujo avisa sem descartar as alterações', () => {
    const base = makeItem();
    const { result, rerender } = setup(base);
    act(() => result.current.setField('title', 'Meu título'));

    rerender({ item: { ...base, title: 'Título de outro usuário' }, update: vi.fn(), move: vi.fn() });

    expect(result.current.remoteChanged).toBe(true);
    expect(result.current.remoteMessage).toBe(REMOTE_CHANGE_MESSAGE);
    expect(result.current.draft?.title).toBe('Meu título');
    expect(result.current.isDirty).toBe(true);
  });

  it('aceitar o remoto adota a versão nova e limpa o aviso', () => {
    const base = makeItem();
    const { result, rerender } = setup(base);
    act(() => result.current.setField('title', 'Meu título'));
    rerender({ item: { ...base, title: 'Título de outro usuário' }, update: vi.fn(), move: vi.fn() });

    act(() => result.current.acceptRemote());

    expect(result.current.remoteChanged).toBe(false);
    expect(result.current.draft?.title).toBe('Título de outro usuário');
    expect(result.current.isDirty).toBe(false);
  });

  it('dispensar o remoto mantém o rascunho', () => {
    const base = makeItem();
    const { result, rerender } = setup(base);
    act(() => result.current.setField('title', 'Meu título'));
    rerender({ item: { ...base, status: 'doing' }, update: vi.fn(), move: vi.fn() });

    act(() => result.current.dismissRemote());

    expect(result.current.remoteChanged).toBe(false);
    expect(result.current.draft?.title).toBe('Meu título');
    expect(result.current.isDirty).toBe(true);
  });

  it('salvar com aviso remoto não reverte campo remoto não editado', async () => {
    const base = makeItem();
    const { result, update, move, rerender } = setup(base);
    act(() => result.current.setField('title', 'Meu título'));

    rerender({ item: { ...base, status: 'doing' }, update, move });
    expect(result.current.remoteChanged).toBe(true);

    let out: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      out = await result.current.save();
    });

    expect(out).toMatchObject({ ok: true, moved: false, patch: { title: 'Meu título' } });
    expect(update).toHaveBeenCalledWith('t1', { title: 'Meu título' });
    expect(move).not.toHaveBeenCalled();
    expect(result.current.draft).toMatchObject({ title: 'Meu título', status: 'doing' });
    expect(result.current.isDirty).toBe(false);
  });

  it('com rascunho limpo, a atualização remota é adotada sem avisar', () => {
    const base = makeItem();
    const { result, rerender } = setup(base);

    rerender({ item: { ...base, title: 'Título novo' }, update: vi.fn(), move: vi.fn() });

    expect(result.current.remoteChanged).toBe(false);
    expect(result.current.draft?.title).toBe('Título novo');
  });

  it('a NOSSA escrita não vira "Esta tarefa mudou" (mesma versão volta do cache)', async () => {
    const base = makeItem();
    const { result, update, move, rerender } = setup(base);
    act(() => result.current.setField('title', 'Salvo por mim'));
    await save({ result });
    expect(update).toHaveBeenCalledWith('t1', { title: 'Salvo por mim' });

    rerender({ item: { ...base, title: 'Salvo por mim' }, update, move });

    expect(result.current.remoteChanged).toBe(false);
    expect(result.current.isDirty).toBe(false);
  });

  it('trocar de tarefa no painel recomeça o rascunho e zera o aviso', () => {
    const base = makeItem();
    const { result, rerender } = setup(base);
    act(() => result.current.setField('title', 'Rascunho da primeira'));
    rerender({ item: { ...base, title: 'Remoto' }, update: vi.fn(), move: vi.fn() });
    expect(result.current.remoteChanged).toBe(true);

    rerender({ item: makeItem({ id: 't2', title: 'Outra tarefa' }), update: vi.fn(), move: vi.fn() });

    expect(result.current.draft?.title).toBe('Outra tarefa');
    expect(result.current.isDirty).toBe(false);
    expect(result.current.remoteChanged).toBe(false);
  });

  it('reset() descarta apenas as alterações locais', () => {
    const { result } = setup(makeItem());
    act(() => result.current.setField('title', 'Descartar'));
    act(() => result.current.reset());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.draft?.title).toBe('Ligar para o cliente');
  });
});

describe('useWorkItemDraft — coerência do lembrete (162/138)', () => {
  beforeEach(resetSupabaseMock);

  it('lembrete no passado é sinalizado para a tela', () => {
    const now = () => new Date('2026-10-11T15:00:00.000Z');
    const { result } = setup(makeItem(), { now });
    act(() => result.current.setField('remindAt', '2026-10-11T13:00:00.000Z'));
    expect(result.current.coherence.state).toBe('in_past');
  });

  it('lembrete antes do prazo confirma o agendamento', () => {
    const now = () => new Date('2026-10-11T15:00:00.000Z');
    const { result } = setup(makeItem(), { now });
    act(() => result.current.setField('dueDate', '2026-10-11T20:00:00.000Z'));
    act(() => result.current.setField('remindAt', '2026-10-11T18:00:00.000Z'));
    expect(result.current.coherence.state).toBe('ok');
  });
});
