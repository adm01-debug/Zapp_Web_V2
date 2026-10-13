/**
 * N-182 (refazer 1) — nomes acessíveis dos botões de ícone e lista sem filhos.
 *
 * Cobre o critério de pronto: lista vazia não renderiza role list/listbox;
 * getByRole('button', { name }) acha limpar busca, cancelar resposta, enviar,
 * gravar (nos dois estados), fechar busca e voltar ao final; axe com
 * button-name, aria-required-children e aria-allowed-attr zerados.
 *
 * Os filhos do inbox no InputArea são stubs: o N-182 cobre só os botões
 * próprios do InputArea, não os pickers internos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import 'vitest-axe/matchers';

vi.mock('@/hooks/team-chat/useActiveDepartments', () => ({
  useActiveDepartments: () => ({
    data: [
      { id: 'd1', name: 'Suporte' },
      { id: 'd2', name: 'Vendas' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    profile: { id: 'u1', organization_id: 'org-1', role: 'admin', name: 'Eu' },
    user: { id: 'u1' },
    isLoading: false,
  }),
}));

vi.mock('@/integrations/supabase/client', () => {
  // Canais privados de digitação/presença (PD-69): stub sem rede — o teste é de a11y.
  const channel = () => {
    const ch: Record<string, unknown> = {};
    ch.on = () => ch;
    ch.subscribe = () => ch;
    ch.track = () => Promise.resolve();
    ch.send = () => Promise.resolve();
    ch.presenceState = () => ({});
    return ch;
  };
  return { supabase: { from: vi.fn(), storage: { from: vi.fn() }, channel, removeChannel: vi.fn() } };
});

vi.mock('@/components/inbox/chat/AIRewriteButton', () => ({ AIRewriteButton: () => null }));
vi.mock('@/components/inbox/StickerPicker', () => ({ StickerPicker: () => null }));
vi.mock('@/components/inbox/AudioMemePicker', () => ({ AudioMemePicker: () => null }));
vi.mock('@/components/inbox/VoiceChangerPicker', () => ({ VoiceChangerPicker: () => null }));
vi.mock('@/components/inbox/CustomEmojiPicker', () => ({ CustomEmojiPicker: () => null }));
vi.mock('@/components/inbox/AudioRecorder', () => ({ AudioRecorder: () => null }));
vi.mock('@/components/mobile/VoiceDictationButton', () => ({ VoiceDictationButton: () => null }));
vi.mock('@/components/inbox/TextToAudioButton', () => ({ TextToAudioButton: () => null }));
vi.mock('@/components/inbox/chat/MentionAutocomplete', () => ({
  MentionAutocomplete: () => null,
  useMentions: () => ({
    isOpen: false,
    cursorPos: 0,
    checkForMention: () => {},
    handleSelect: () => {},
    close: () => {},
  }),
}));
vi.mock('@/components/inbox/chat/RichTextToolbar', () => ({
  RichTextToolbar: () => null,
  RichTextToggle: () => null,
}));
vi.mock('@/components/inbox/chat/MarkdownPreview', () => ({ MarkdownPreview: () => null }));

import { TeamConversationList } from '../TeamConversationList';
import { TeamChatInputArea } from '../TeamChatInputArea';
import { TeamFileUploader } from '../TeamFileUploader';
import { TeamChatPanel } from '../TeamChatPanel';
import type { ComponentProps } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import type { TeamMessage } from '@/hooks/team-chat/teamChatTypes';

const convs = [
  {
    id: 'conv-a',
    type: 'direct',
    name: 'Ana',
    last_message: { content: 'oi', created_at: '2026-10-01T00:00:00Z' },
    unread_count: 0,
    department_id: null,
  },
  {
    id: 'conv-b',
    type: 'group',
    name: 'Comercial',
    last_message: { content: 'tudo bem?', created_at: '2026-10-01T00:00:00Z' },
    unread_count: 3,
    department_id: null,
  },
] as unknown as TeamConversation[];

function renderList(conversations: TeamConversation[] = convs) {
  return render(
    <TeamConversationList
      conversations={conversations}
      selectedId="conv-a"
      onSelect={() => {}}
    />,
  );
}

function typeSearch(value: string) {
  fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value } });
}

describe('N-182 — lista de conversas', () => {
  it('lista vazia (sem conversas) não renderiza role list nem listbox', () => {
    renderList([]);
    expect(screen.getByText('Nenhuma conversa')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Conversas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('busca sem resultado não renderiza role list nem listbox', () => {
    const { container } = renderList();
    typeSearch('zzz-sem-match');
    expect(container.querySelector('[role="list"]')).toBeNull();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(screen.getByText('Nenhuma conversa')).toBeInTheDocument();
  });

  it('botão limpar busca tem nome acessível', () => {
    renderList();
    typeSearch('ana');
    expect(screen.getByRole('button', { name: 'Limpar busca' })).toBeInTheDocument();
  });
});

const replyMsg = {
  id: 'm-1',
  conversation_id: 'c1',
  sender_id: 'u2',
  content: 'mensagem citada',
  message_type: 'text',
  media_url: null,
  media_type: null,
  reply_to_id: null,
  is_edited: false,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  sender: { id: 'u2', name: 'Ana', avatar_url: null },
} as TeamMessage;

function renderInput(overrides: Partial<ComponentProps<typeof TeamChatInputArea>> = {}) {
  const noop = () => {};
  return render(
    <TooltipProvider>
    <TeamChatInputArea
      conversationId="c1"
      text="oi"
      setText={noop}
      replyTo={replyMsg}
      isRecordingAudio={false}
      isPending={false}
      onSend={noop}
      onCancelReply={noop}
      onRecordToggle={noop}
      onAudioSend={noop}
      onSendSticker={noop}
      onSendAudioMeme={noop}
      onSendCustomEmoji={noop}
      onFileSent={noop}
      {...overrides}
    />
    </TooltipProvider>,
  );
}

describe('N-182 — botões do input e do uploader', () => {
  it('cancelar resposta, enviar e gravar têm nome acessível', () => {
    renderInput();
    expect(screen.getByRole('button', { name: 'Cancelar resposta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gravar áudio' })).toBeInTheDocument();
  });

  it('gravando: botão vira Parar gravação', () => {
    renderInput({ isRecordingAudio: true, text: '' });
    expect(screen.getByRole('button', { name: 'Parar gravação' })).toBeInTheDocument();
  });

  it('enviar arquivo e fechar preview têm nome acessível', () => {
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn(() => 'blob:n182') as unknown as typeof URL.createObjectURL;
    }
    if (!window.URL.revokeObjectURL) {
      window.URL.revokeObjectURL = vi.fn();
    }
    render(<TeamFileUploader conversationId="c1" onFileSent={() => {}} />);
    expect(screen.getByRole('button', { name: 'Enviar arquivo' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Selecionar arquivo para enviar'), {
      target: { files: [new File(['conteudo'], 'a.png', { type: 'image/png' })] },
    });
    expect(screen.getByRole('button', { name: 'Fechar preview' })).toBeInTheDocument();
  });
});

const panelState = {
  tts: { activeMessageId: null, isPlaying: false, speak: vi.fn(), stop: vi.fn() },
  profile: { id: 'u1', organization_id: 'org-1', role: 'admin', name: 'Eu' },
  showSearch: true,
  searchInputRef: { current: null },
  searchQuery: '',
  setShowSearch: vi.fn(),
  setSearchQuery: vi.fn(),
  filteredMessages: [],
  scrollRef: { current: null },
  isLoading: false,
  hasOlderMessages: false,
  isFetchingOlder: false,
  fetchOlderMessages: vi.fn(),
  showScrollDown: true,
  scrollToBottom: vi.fn(),
  checkNearBottom: vi.fn(),
  isNearBottomRef: { current: true },
  text: '',
  setText: vi.fn(),
  replyTo: null,
  setReplyTo: vi.fn(),
  isRecordingAudio: false,
  setIsRecordingAudio: vi.fn(),
  sendMutation: { isPending: false },
  handleSend: vi.fn(),
  handleAudioSend: vi.fn(),
  handleSendSticker: vi.fn(),
  handleSendAudioMeme: vi.fn(),
  handleSendCustomEmoji: vi.fn(),
  handleFileSent: vi.fn(),
  messages: [],
  reactions: {},
  isMuted: false,
  muteMutation: { mutate: vi.fn() },
  showAddMembers: false,
  setShowAddMembers: vi.fn(),
  editingId: null,
  editText: '',
  setEditText: vi.fn(),
  handleStartEdit: vi.fn(),
  handleSaveEdit: vi.fn(),
  handleCancelEdit: vi.fn(),
  handleDelete: vi.fn(),
  handleCopyMessage: vi.fn(),
};

vi.mock('../useTeamChatPanel', () => ({
  useTeamChatPanel: () => panelState,
}));

vi.mock('../AddMembersDialog', () => ({
  AddMembersDialog: () => null,
}));

describe('N-182 — botões do painel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fechar busca e voltar ao final têm nome acessível', () => {
    render(
      <TooltipProvider>
        <TeamChatPanel
          conversation={{ id: 'conv-a', type: 'group' } as TeamConversation}
          onBack={() => {}}
        />
      </TooltipProvider>,
    );
    // Fechar busca existe no cabeçalho (toggle) e na barra de busca do painel.
    expect(screen.getAllByRole('button', { name: 'Fechar busca' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Voltar ao final' })).toBeInTheDocument();
  });
});

const N182_RULES = ['button-name', 'aria-required-children', 'aria-allowed-attr'];

describe('N-182 — axe', () => {
  it('lista com itens: button-name, aria-required-children e aria-allowed-attr zerados', async () => {
    const { container } = renderList();
    const results = await axe(container, { runOnly: N182_RULES } as never);
    expect(results.violations).toEqual([]);
  });

  it('lista vazia: button-name, aria-required-children e aria-allowed-attr zerados', async () => {
    const { container } = renderList([]);
    const results = await axe(container, { runOnly: N182_RULES } as never);
    expect(results.violations).toEqual([]);
  });
});
