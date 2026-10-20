import { useState, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatMessageInput } from '../ChatMessageInput';
import { TooltipProvider } from '@/components/ui/tooltip';
import { haBloqueioRecarga } from '@/lib/reload-blockers';

// Ferramentas decorativas do campo (anexo/atalhos/catalogo) puxam AuthProvider e
// react-query pelo proprio arranjo de providers do app. Nada disso faz parte do
// comportamento testado aqui (o bloqueio de recarga), entao os filhos pesados ficam
// reduzidos a stubs inocuos — o `ChatMessageInput` em si e renderizado de verdade.
vi.mock('@/components/inbox/FileUploader', () => ({
  FileUploader: () => null,
}));
vi.mock('@/components/inbox/chat/InputExtraTools', () => ({
  InputExtraTools: () => null,
}));

type PropsDaEntrada = ComponentProps<typeof ChatMessageInput>;

/**
 * Monta o `ChatMessageInput` real com estado controlado (o pai de verdade guarda o
 * texto e devolve via `inputValue`). Digitar no campo passa pelo componente real:
 * `onInputChange` atualiza o estado do harness e o texto volta como prop.
 */
function Harness({ inicial = '', ...overrides }: { inicial?: string } & Partial<PropsDaEntrada>) {
  const [valor, setValor] = useState(inicial);
  const props: PropsDaEntrada = {
    inputValue: valor,
    replyToMessage: null,
    isRecordingAudio: false,
    showSlashCommands: false,
    contactId: 'contato-1',
    contactPhone: '5511999999999',
    contactName: 'Contato Teste',
    messages: [],
    quickReplies: [],
    onInputChange: setValor,
    onSend: vi.fn(),
    onCancelReply: vi.fn(),
    onSlashCommand: vi.fn(),
    onCloseSlashCommands: vi.fn(),
    onQuickReply: vi.fn(),
    onRecordToggle: vi.fn(),
    onAudioSend: vi.fn(),
    onAudioCancel: vi.fn(),
    onOpenInteractiveBuilder: vi.fn(),
    onOpenSchedule: vi.fn(),
    onOpenLocationPicker: vi.fn(),
    onTypingStart: vi.fn(),
    onTypingStop: vi.fn(),
    ...overrides,
  };
  return (
    <TooltipProvider>
      <ChatMessageInput {...props} />
    </TooltipProvider>
  );
}

function campo() {
  return screen.getByLabelText('Escrever mensagem') as HTMLTextAreaElement;
}

describe('ChatMessageInput — bloqueio de recarga enquanto ha mensagem em edicao', () => {
  beforeEach(() => {
    expect(haBloqueioRecarga()).toBe(false);
  });

  afterEach(() => {
    // O auto-cleanup do RTL desmonta o componente; nada pode sobrar registrado.
    cleanup();
  });

  it('bloqueia a recarga quando o campo recebe texto', () => {
    render(<Harness />);
    expect(haBloqueioRecarga()).toBe(false);

    fireEvent.change(campo(), { target: { value: 'Ola' } });

    expect(campo().value).toBe('Ola');
    expect(haBloqueioRecarga()).toBe(true);
  });

  it('ja nasce bloqueado quando o campo e montado com texto nao vazio', () => {
    render(<Harness inicial="rascunho" />);
    expect(haBloqueioRecarga()).toBe(true);
  });

  it('libera o bloqueio quando o campo e esvaziado', () => {
    render(<Harness />);
    fireEvent.change(campo(), { target: { value: 'Ola' } });
    expect(haBloqueioRecarga()).toBe(true);

    fireEvent.change(campo(), { target: { value: '' } });

    expect(haBloqueioRecarga()).toBe(false);
  });

  it('nao bloqueia com espacos em branco isolados', () => {
    render(<Harness />);

    fireEvent.change(campo(), { target: { value: '   ' } });

    expect(haBloqueioRecarga()).toBe(false);
  });

  it('libera o bloqueio ao desmontar com texto ainda no campo', () => {
    const { unmount } = render(<Harness />);
    fireEvent.change(campo(), { target: { value: 'Ola' } });
    expect(haBloqueioRecarga()).toBe(true);

    unmount();

    expect(haBloqueioRecarga()).toBe(false);
  });

  it('trocar entre dois textos nao acumula registros: esvaziar depois libera tudo', () => {
    render(<Harness />);

    fireEvent.change(campo(), { target: { value: 'a' } });
    fireEvent.change(campo(), { target: { value: 'ab' } });
    fireEvent.change(campo(), { target: { value: 'abc' } });
    expect(haBloqueioRecarga()).toBe(true);

    fireEvent.change(campo(), { target: { value: '' } });

    // Se cada troca tivesse deixado um registro para tras, ainda haveria bloqueio ativo.
    expect(haBloqueioRecarga()).toBe(false);
  });
});
