import { createElement, type ComponentProps, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_TEAM_CHAT_FILE_SIZE,
  canCreateTeamConversation,
  getTeamChatFileSizeError,
  getTeamChatNotificationBody,
  shouldNotifyTeamMessage,
} from '@/lib/teamChatRules';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * O bloco de autenticacao lia `useTeamChatMutations.ts` como TEXTO
 * (`readFileSync` + `indexOf`) e comparava a posicao das strings. Isso nao
 * exercita o hook: passa com o guard removido (a string ainda existe no
 * arquivo) e quebra com qualquer reformatacao. Aqui a fronteira Supabase e
 * dublada e o hook de producao e CHAMADO.
 */
const f = vi.hoisted(() => {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const deletes: Array<{ table: string }> = [];
  // Falha injetada na fronteira do banco (o cliente real responde `{ data, error }`).
  const banco = { erro: null as { message: string } | null };
  // Estado do resolvedor de URL assinada (fronteira de rede): o componente REAL
  // (MediaContent) tem de reagir a cada estado dele.
  const storage = { resolvido: true, carregando: false };
  return {
    inserts, updates, deletes, banco, storage,
    perfil: { id: 'eu', role: 'admin' } as { id: string; role: string } | null,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const no: Record<string, unknown> = {};
      no.insert = (payload: Record<string, unknown>) => {
        f.inserts.push({ table, payload });
        return {
          select: () => ({
            single: () => Promise.resolve(f.banco.erro
              ? { data: null, error: f.banco.erro }
              : { data: { id: 'msg-1' }, error: null }),
          }),
        };
      };
      no.update = (payload: Record<string, unknown>) => { f.updates.push({ table, payload }); return no; };
      no.delete = () => { f.deletes.push({ table }); return no; };
      no.eq = () => no;
      // `await supabase.from(t).update(x).eq(...)` resolve com o erro configurado
      // (mesmo formato do PostgREST: objeto com `message`).
      no.then = (resolve: (v: unknown) => unknown) => resolve({ error: f.banco.erro });
      return no;
    },
  },
}));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({
    url: f.storage.resolvido ? source : '',
    isLoading: f.storage.carregando,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => ({}),
}));

vi.mock('@/hooks/team-chat/useActiveDepartments', () => ({
  useActiveDepartments: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: f.perfil }) }));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { useDeleteTeamMessage, useEditTeamMessage, useSendTeamMessage } from '@/hooks/team-chat/useTeamChatMutations';
import { toast } from '@/hooks/ui/use-toast';
import { TeamConversationList } from '../TeamConversationList';
import { TeamMessageItem } from '../TeamMessageItem';
import { MediaContent } from '../teamChatParts';
import type { TeamConversation, TeamMessage } from '@/hooks/team-chat/teamChatTypes';

describe('Team Chat — autenticação', () => {
  beforeEach(() => {
    f.inserts.length = 0;
  });

  it('useSendTeamMessage recusa o envio sem perfil e não chega ao banco', async () => {
    f.perfil = null;
    const { result } = renderHook(() => useSendTeamMessage(), { wrapper: TestQueryWrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ conversationId: 'conversa', content: 'oi' }),
      ).rejects.toThrow('Not authenticated');
    });

    expect(f.inserts).toEqual([]);
  });

  it('useSendTeamMessage grava a mensagem quando há perfil', async () => {
    f.perfil = { id: 'eu', role: 'admin' };
    const { result } = renderHook(() => useSendTeamMessage(), { wrapper: TestQueryWrapper });

    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'conversa', content: 'oi' });
    });

    expect(f.inserts).toHaveLength(1);
    expect(f.inserts[0].table).toBe('team_messages');
    expect(f.inserts[0].payload.sender_id).toBe('eu');
  });
});

describe('Team Chat — regras usadas pela produção', () => {
  const notification = {
    senderId: 'colega', profileId: 'eu', documentHidden: false,
    activeConversationId: 'outra', conversationId: 'conversa',
    membership: { is_muted: false },
  };

  it.each([
    ['própria', { senderId: 'eu' }, false],
    ['ativa e visível', { activeConversationId: 'conversa' }, false],
    ['ativa, documento oculto', { activeConversationId: 'conversa', documentHidden: true }, true],
    ['sem membership', { membership: null }, false],
    ['silenciada', { membership: { is_muted: true } }, false],
    ['mute nulo', { membership: { is_muted: null } }, true],
  ] as const)('decide notificação: %s', (_caso, change, expected) => {
    expect(shouldNotifyTeamMessage({ ...notification, ...change })).toBe(expected);
  });

  it.each([
    ['image', '📷 Imagem'], ['audio', '🎤 Áudio'], ['audio_meme', '🎤 Áudio'],
    ['video', '🎥 Vídeo'], ['sticker', '🎨 Figurinha'], ['document', '📎 Documento'],
  ])('gera label para %s', (type, expected) => {
    expect(getTeamChatNotificationBody(type, 'texto')).toBe(expected);
  });

  it('usa e trunca o texto sem mídia ou com tipo desconhecido', () => {
    const content = 'a'.repeat(120);
    expect(getTeamChatNotificationBody(null, content)).toBe('a'.repeat(100));
    expect(getTeamChatNotificationBody('futuro', content)).toBe('a'.repeat(100));
  });

  it.each([
    ['direct', 0, null, false], ['direct', 1, null, true],
    ['group', 1, null, false], ['group', 2, null, true],
    ['department', 0, null, false], ['department', 0, 'dep-1', true],
  ] as const)('valida criação %s com %i membro(s)', (type, selectedMemberCount, selectedDepartmentId, expected) => {
    expect(canCreateTeamConversation({ type, selectedMemberCount, selectedDepartmentId })).toBe(expected);
  });

  it('rejeita arquivo vazio e acima de 10 MiB, mas aceita o limite', () => {
    expect(getTeamChatFileSizeError(0)).toBe('empty');
    expect(getTeamChatFileSizeError(MAX_TEAM_CHAT_FILE_SIZE)).toBeNull();
    expect(getTeamChatFileSizeError(MAX_TEAM_CHAT_FILE_SIZE + 1)).toBe('too-large');
  });
});

/**
 * SL-073 — os dois `it.todo` que ficaram aqui (persistência/invalidação das
 * mutations e renderização de mídia/lista/acessibilidade) viraram prova
 * comportamental. As mutações REAIS são executadas contra a fronteira do
 * Supabase dublada (payload gravado + invalidação observada no QueryClient real)
 * e os componentes REAIS de mensagem, mídia e lista são renderizados e acionados
 * como o usuário aciona (clique, teclado, foco).
 */
function clienteDeTeste() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const invalidar = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { invalidar, wrapper };
}

function mensagem(over: Partial<TeamMessage> = {}): TeamMessage {
  return {
    id: 'msg-1',
    conversation_id: 'conv-a',
    sender_id: 'outro',
    content: '',
    message_type: 'text',
    media_url: null,
    media_type: null,
    reply_to_id: null,
    is_edited: false,
    status: 'sent',
    created_at: '2026-10-04T10:00:00',
    updated_at: '2026-10-04T10:00:00',
    sender: { id: 'outro', name: 'Ana', avatar_url: null },
    ...over,
  };
}

describe('Team Chat — persistência e invalidação das mutations', () => {
  beforeEach(() => {
    f.inserts.length = 0;
    f.updates.length = 0;
    f.deletes.length = 0;
    f.banco.erro = null;
    f.perfil = { id: 'eu', role: 'admin' };
    vi.clearAllMocks();
  });

  it('useSendTeamMessage persiste conteúdo e mídia e toca o updated_at da conversa', async () => {
    const { wrapper } = clienteDeTeste();
    const { result } = renderHook(() => useSendTeamMessage(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-a',
        content: 'segue o contrato',
        replyToId: 'msg-0',
        mediaUrl: 'https://exemplo.test/contrato.pdf',
        mediaType: 'document',
        mediaBucket: 'team-chat-files',
        mediaPath: 'conv-a/contrato.pdf',
      });
    });

    expect(f.inserts).toHaveLength(1);
    expect(f.inserts[0].table).toBe('team_messages');
    expect(f.inserts[0].payload).toMatchObject({
      conversation_id: 'conv-a',
      sender_id: 'eu',
      content: 'segue o contrato',
      reply_to_id: 'msg-0',
      media_url: 'https://exemplo.test/contrato.pdf',
      media_type: 'document',
      media_bucket: 'team-chat-files',
      media_path: 'conv-a/contrato.pdf',
    });
    expect(f.updates).toHaveLength(1);
    expect(f.updates[0].table).toBe('team_conversations');
    expect(typeof f.updates[0].payload.updated_at).toBe('string');
  });

  it('useSendTeamMessage invalida a lista de mensagens da conversa e a de conversas', async () => {
    const { invalidar, wrapper } = clienteDeTeste();
    const { result } = renderHook(() => useSendTeamMessage(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'conv-a', content: 'oi' });
    });

    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['team-messages', 'conv-a'] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['team-conversations'] });
  });

  it('erro do banco no envio propaga a falha, avisa e NÃO invalida o cache', async () => {
    f.banco.erro = { message: 'permissão negada' };
    const { invalidar, wrapper } = clienteDeTeste();
    const { result } = renderHook(() => useSendTeamMessage(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ conversationId: 'conv-a', content: 'oi' }),
      ).rejects.toMatchObject({ message: 'permissão negada' });
    });

    expect(invalidar).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ title: 'Erro ao enviar mensagem', variant: 'destructive' });
  });

  it('useEditTeamMessage grava o texto com is_edited e invalida as mensagens da conversa', async () => {
    const { invalidar, wrapper } = clienteDeTeste();
    const { result } = renderHook(() => useEditTeamMessage(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ messageId: 'msg-1', content: 'corrigido', conversationId: 'conv-a' });
    });

    expect(f.updates).toHaveLength(1);
    expect(f.updates[0].table).toBe('team_messages');
    expect(f.updates[0].payload).toMatchObject({ content: 'corrigido', is_edited: true });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['team-messages', 'conv-a'] });
  });

  it('useDeleteTeamMessage apaga a mensagem e invalida as duas listas', async () => {
    const { invalidar, wrapper } = clienteDeTeste();
    const { result } = renderHook(() => useDeleteTeamMessage(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ messageId: 'msg-1', conversationId: 'conv-a' });
    });

    expect(f.deletes).toEqual([{ table: 'team_messages' }]);
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['team-messages', 'conv-a'] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['team-conversations'] });
  });
});

describe('Team Chat — renderização de mídia', () => {
  beforeEach(() => {
    f.storage.resolvido = true;
    f.storage.carregando = false;
    vi.clearAllMocks();
  });

  it('mostra a imagem enviada e abre em nova aba ao clicar', () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(createElement(MediaContent, {
      msg: mensagem({ media_url: 'https://exemplo.test/foto.png', media_type: 'image' }),
    }));

    const img = screen.getByAltText('Imagem enviada');
    expect(img).toHaveAttribute('src', 'https://exemplo.test/foto.png');
    fireEvent.click(img);
    expect(abrir).toHaveBeenCalledWith('https://exemplo.test/foto.png', '_blank');
    abrir.mockRestore();
  });

  it('mostra vídeo e áudio com controles', () => {
    const { unmount } = render(createElement(MediaContent, {
      msg: mensagem({ media_url: 'https://exemplo.test/clipe.mp4', media_type: 'video' }),
    }));
    expect((screen.getByLabelText('Vídeo enviado') as HTMLVideoElement).controls).toBe(true);
    unmount();

    render(createElement(MediaContent, {
      msg: mensagem({ media_url: 'https://exemplo.test/recado.mp3', media_type: 'audio' }),
    }));
    expect((screen.getByLabelText('Áudio enviado') as HTMLAudioElement).controls).toBe(true);
  });

  it('mostra o documento como link acessível para abrir em nova aba', () => {
    render(createElement(MediaContent, {
      msg: mensagem({
        media_url: 'https://exemplo.test/contrato.pdf',
        media_type: 'document',
        content: 'contrato.pdf',
      }),
    }));

    const link = screen.getByRole('link', { name: 'Abrir documento: contrato.pdf' });
    expect(link).toHaveAttribute('href', 'https://exemplo.test/contrato.pdf');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('avisa enquanto a URL da mídia é assinada e alerta quando ela não resolve', () => {
    f.storage.carregando = true;
    const { unmount } = render(createElement(MediaContent, {
      msg: mensagem({ media_url: 'https://exemplo.test/foto.png', media_type: 'image' }),
    }));
    expect(screen.getByLabelText('Carregando mídia')).toBeInTheDocument();
    unmount();

    f.storage.carregando = false;
    f.storage.resolvido = false;
    render(createElement(MediaContent, {
      msg: mensagem({ media_url: 'https://exemplo.test/foto.png', media_type: 'image' }),
    }));
    expect(screen.getByRole('alert')).toHaveTextContent('Mídia indisponível');
  });
});

const conversas: TeamConversation[] = [
  {
    id: 'conv-a', type: 'group', name: 'Comercial', avatar_url: null, created_by: 'eu',
    created_at: '2026-10-01T09:00:00', updated_at: '2026-10-04T10:00:00',
    last_message: mensagem({ content: 'bom dia' }), unread_count: 3,
  },
  {
    id: 'conv-b', type: 'direct', name: 'Ana', avatar_url: null, created_by: 'eu',
    created_at: '2026-10-02T09:00:00', updated_at: '2026-10-03T10:00:00',
    last_message: null, unread_count: 0,
  },
];

describe('Team Chat — lista de conversas', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('lista as conversas, marca a selecionada e mostra os não lidos', () => {
    render(createElement(TeamConversationList, {
      conversations: conversas, selectedId: 'conv-a', onSelect: vi.fn(),
    }));

    expect(screen.getByRole('listbox', { name: 'Conversas' })).toBeInTheDocument();
    const opcoes = screen.getAllByRole('option');
    expect(opcoes).toHaveLength(2);
    expect(opcoes[0]).toHaveAttribute('aria-selected', 'true');
    expect(opcoes[1]).toHaveAttribute('aria-selected', 'false');
    expect(opcoes[0]).toHaveTextContent('Comercial');
    expect(opcoes[0]).toHaveTextContent('3');
  });

  it('seleciona a conversa pelo clique e pelo teclado', () => {
    const selecionar = vi.fn();
    render(createElement(TeamConversationList, {
      conversations: conversas, selectedId: null, onSelect: selecionar,
    }));
    const opcoes = screen.getAllByRole('option');

    fireEvent.click(opcoes[0]);
    expect(selecionar).toHaveBeenCalledWith('conv-a');

    opcoes[0].focus();
    fireEvent.keyDown(opcoes[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(opcoes[1]);
    fireEvent.keyDown(opcoes[1], { key: 'Enter' });
    expect(selecionar).toHaveBeenCalledWith('conv-b');
  });

  it('filtra pela busca e pelo tipo e mostra o estado vazio', () => {
    render(createElement(TeamConversationList, {
      conversations: conversas, selectedId: null, onSelect: vi.fn(),
    }));

    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'ana' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Ana');

    fireEvent.click(screen.getByRole('tab', { name: 'Grupos' }));
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Nenhuma conversa')).toBeInTheDocument();
  });
});

type ItemProps = ComponentProps<typeof TeamMessageItem>;

function propsDaMensagem(msg: TeamMessage, over: Partial<ItemProps> = {}): ItemProps {
  return {
    msg,
    isMine: false,
    showDate: false,
    conversationType: 'group',
    repliedMsg: null,
    isEditing: false,
    editText: '',
    ttsIsPlaying: false,
    ttsIsLoading: false,
    reactions: [],
    onReply: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onCopy: vi.fn(),
    onTtsToggle: vi.fn(),
    onSaveEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    setEditText: vi.fn(),
    ...over,
  };
}

describe('Team Chat — acessibilidade da mensagem', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('anuncia remetente e horário na mensagem e nomeia o remetente no grupo', () => {
    render(createElement(TeamMessageItem, propsDaMensagem(mensagem({ content: 'oi' }))));

    expect(screen.getByLabelText('Mensagem de Ana às 10:00')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });

  it('anuncia o separador de data da lista de mensagens', () => {
    const agora = new Date();
    render(createElement(TeamMessageItem, propsDaMensagem(
      mensagem({ content: 'oi', created_at: agora.toISOString(), updated_at: agora.toISOString() }),
      { showDate: true },
    )));

    expect(screen.getByRole('separator', { name: 'Hoje' })).toBeInTheDocument();
  });

  it('edita com campo rotulado: Enter salva e Escape cancela', () => {
    const onSaveEdit = vi.fn();
    const onCancelEdit = vi.fn();
    const setEditText = vi.fn();
    render(createElement(TeamMessageItem, propsDaMensagem(
      mensagem({ content: 'original', sender_id: 'eu' }),
      { isMine: true, isEditing: true, editText: 'original', onSaveEdit, onCancelEdit, setEditText },
    )));

    const campo = screen.getByLabelText('Editar mensagem');
    fireEvent.change(campo, { target: { value: 'corrigido' } });
    expect(setEditText).toHaveBeenCalledWith('corrigido');

    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(onSaveEdit).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it('não tem violação de acessibilidade na lista e na mensagem (axe)', async () => {
    const { container } = render(createElement('div', { role: 'log', 'aria-live': 'polite' },
      createElement(TeamMessageItem, propsDaMensagem(mensagem({ content: 'bom dia' }))),
      createElement(TeamMessageItem, propsDaMensagem(
        mensagem({ id: 'msg-2', content: 'bom dia!', sender_id: 'eu', status: 'read' }),
        { isMine: true },
      )),
    ));

    expect(await axe(container)).toHaveNoViolations();
  });
});
