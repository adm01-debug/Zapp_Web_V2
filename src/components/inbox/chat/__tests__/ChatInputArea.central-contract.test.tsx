import { createRef, forwardRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatInputArea } from '../ChatInputArea';
import type { FileUploaderRef } from '../../FileUploader';

vi.mock('../useChatInputLogic', () => ({
  setNativeValue: vi.fn(),
  useChatInputLogic: () => ({
    showRichToolbar: false,
    setShowRichToolbar: vi.fn(),
    showMarkdownPreview: false,
    hasText: false,
    isMobile: false,
    isOverLimit: false,
    isNearLimit: false,
    charCount: 0,
    CHAR_LIMIT: 4096,
    sendAnimation: false,
    handlePaste: vi.fn(),
    handleSendWithAnimation: vi.fn(),
    handleVoiceDictation: vi.fn(),
  }),
}));

vi.mock('../MentionAutocomplete', () => ({
  MentionAutocomplete: () => null,
  useMentions: () => ({
    isOpen: false,
    cursorPos: 0,
    checkForMention: vi.fn(),
    handleSelect: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock('../RichTextToolbar', () => ({
  RichTextToolbar: () => null,
  RichTextToggle: () => null,
}));
vi.mock('../InputPreviewBars', () => ({ InputPreviewBars: () => null }));
vi.mock('../MarkdownPreview', () => ({ MarkdownPreview: () => null }));
vi.mock('../../SlashCommands', () => ({ SlashCommands: () => null }));
vi.mock('../../AudioRecorder', () => ({ AudioRecorder: () => null }));
vi.mock('../ChatInputToolbars', () => ({
  SecondaryToolbar: () => <div data-testid="secondary-tools" />,
  TertiaryToolsMenu: () => <div data-testid="tertiary-tools" />,
}));
vi.mock('../AIRewriteButton', () => ({ AIRewriteButton: () => null }));
vi.mock('../../StickerPicker', () => ({ StickerPicker: () => null }));
vi.mock('../../CustomEmojiPicker', () => ({ CustomEmojiPicker: () => null }));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../FileUploader', () => ({
  FileUploader: forwardRef(function FileUploaderMock(_, _ref) {
    return <button type="button" aria-label="Anexar arquivo">Anexar</button>;
  }),
}));

function makeProps() {
  return {
    inputValue: '',
    replyToMessage: null,
    editingMessage: null,
    isRecordingAudio: false,
    showSlashCommands: false,
    contactId: 'contact-1',
    contactPhone: '5511999999999',
    contactName: 'Contato Teste',
    instanceName: 'instance-1',
    messages: [],
    quickReplies: [],
    onInputChange: vi.fn(),
    onKeyDown: vi.fn(),
    onBlur: vi.fn(),
    onSend: vi.fn(),
    onCancelReply: vi.fn(),
    onCancelEdit: vi.fn(),
    onSlashCommand: vi.fn(),
    onCloseSlashCommands: vi.fn(),
    onQuickReply: vi.fn(),
    onRecordToggle: vi.fn(),
    onAudioSend: vi.fn(),
    onAudioCancel: vi.fn(),
    onOpenInteractiveBuilder: vi.fn(),
    onOpenSchedule: vi.fn(),
    onOpenQuickReplies: vi.fn(),
    onOpenAssistant: vi.fn(),
    onOpenTransfer: vi.fn(),
    onOpenLocationPicker: vi.fn(),
    onSendProduct: vi.fn(),
    onSendSticker: vi.fn(),
    onSendAudioMeme: vi.fn(),
    onSendCustomEmoji: vi.fn(),
    onOpenCatalog: vi.fn(),
    onSelectSuggestion: vi.fn(),
    onSelectTemplate: vi.fn(),
    fileUploaderRef: createRef<FileUploaderRef>(),
    inputRef: createRef<HTMLTextAreaElement>(),
  };
}

describe('ChatInputArea — contrato das ações rápidas centrais', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expõe exatamente as seis ações rápidas previstas, sem duplicatas', () => {
    const props = makeProps();
    render(<TooltipProvider><ChatInputArea {...props} /></TooltipProvider>);

    const toolbar = screen.getByRole('toolbar', { name: 'Ações rápidas da conversa' });
    const actions = [
      'Resposta rápida',
      'Assistente IA',
      'Anexar arquivo',
      'Agendar',
      'Transferir',
      'Mais ferramentas de mensagem',
    ];

    expect(toolbar.querySelectorAll('button')).toHaveLength(6);
    for (const name of actions) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('preserva os handlers canônicos das ações que alteram o estado do chat', () => {
    const props = makeProps();
    render(<TooltipProvider><ChatInputArea {...props} /></TooltipProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Resposta rápida' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assistente IA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));

    expect(props.onOpenQuickReplies).toHaveBeenCalledTimes(1);
    expect(props.onOpenAssistant).toHaveBeenCalledTimes(1);
    expect(props.onOpenSchedule).toHaveBeenCalledTimes(1);
    expect(props.onOpenTransfer).toHaveBeenCalledTimes(1);
  });
});
