import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

const toast = vi.hoisted(() => ({
  success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(),
}));
vi.mock('sonner', () => ({ toast }));

type Action = { action: string; response: string; data?: Record<string, unknown> };

/**
 * Só o motor de fala (ElevenLabs/microfone) é dublado — ele fala com serviço
 * externo. O overlay, a ponte (`VoiceActionBridge`) e o plano são os de
 * produção, e é o `onAction` que a ponte entrega ao overlay que é exercitado.
 */
const voice = vi.hoisted(() => ({ onAction: undefined as undefined | ((a: unknown) => void) }));
vi.mock('@/hooks/communication/useVoiceAgent', () => ({
  useVoiceAgent: (options?: { onAction?: (a: unknown) => void }) => {
    voice.onAction = options?.onAction;
    return {
      phase: 'listening',
      partialTranscript: '',
      finalTranscript: '',
      agentResponse: '',
      error: '',
      startListening: vi.fn(async () => {}),
      stopListening: vi.fn(),
      stopSpeaking: vi.fn(),
      reset: vi.fn(),
    };
  },
}));

import { VoiceActionBridge } from '../VoiceActionBridge';

function query() {
  return new URLSearchParams(window.location.search);
}

/** Abre o assistente (FAB) e devolve o `onAction` que a ponte ligou no overlay. */
async function openVoiceAssistant(onNavigate: (view: string) => void) {
  render(
    <TooltipProvider>
      <BrowserRouter>
        <VoiceActionBridge onNavigate={onNavigate} />
      </BrowserRouter>
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Assistente de voz' }));
  await waitFor(() => expect(voice.onAction).toBeTypeOf('function'));
  return voice.onAction as (action: Action) => void;
}

async function dispatch(onAction: (action: Action) => void, action: Action) {
  await act(async () => { onAction(action); });
}

describe('VoiceActionBridge — o comando de voz aplica o parâmetro (item 340)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    voice.onAction = undefined;
    window.history.replaceState(null, '', '/');
  });

  it('"buscar" grava a consulta no estado real da lista e navega', async () => {
    const onNavigate = vi.fn();
    const onAction = await openVoiceAssistant(onNavigate);

    await dispatch(onAction, { action: 'search', response: 'Buscando por Ana', data: { query: 'ana' } });

    // O estado que a lista lê mudou de verdade — não só o aviso.
    expect(query().get('q')).toBe('ana');
    expect(onNavigate).toHaveBeenCalledWith('inbox');
    expect(toast.success).toHaveBeenCalledWith('Buscando: "ana"');
  });

  it('"filtrar não lidas" grava o status no estado real da lista', async () => {
    const onNavigate = vi.fn();
    const onAction = await openVoiceAssistant(onNavigate);

    await dispatch(onAction, {
      action: 'filter', response: 'Mostrando não lidas', data: { filters: { unread: true } },
    });

    expect(query().get('status')).toBe('unread');
    expect(onNavigate).toHaveBeenCalledWith('inbox');
    expect(toast.success).toHaveBeenCalledWith('Filtros aplicados: não lidas');
  });

  it('"limpar" apaga busca e filtros do estado real e confirma só o que apagou', async () => {
    window.history.replaceState(null, '', '/?view=inbox&q=ana&status=unread&type=cliente');
    const onNavigate = vi.fn();
    const onAction = await openVoiceAssistant(onNavigate);

    await dispatch(onAction, { action: 'clear', response: 'Filtros limpos', data: {} });

    expect(query().get('q')).toBeNull();
    expect(query().get('status')).toBeNull();
    expect(query().get('type')).toBeNull();
    // o `view` é de outro dono da URL: preservado
    expect(query().get('view')).toBe('inbox');
    expect(toast.success).toHaveBeenCalledWith('Filtros limpos');
  });

  it('"ordenar" não existe no estado da lista: avisa indisponibilidade em vez de anunciar sucesso', async () => {
    const onNavigate = vi.fn();
    const onAction = await openVoiceAssistant(onNavigate);

    await dispatch(onAction, { action: 'sort', response: 'Ordenando por mais recentes', data: { sortBy: 'newest' } });

    expect(query().toString()).toBe('');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith('Ordenação por comando de voz ainda não está disponível.');
  });

  it('"limpar" sem nada ativo diz que não havia o que limpar', async () => {
    const onAction = await openVoiceAssistant(vi.fn());

    await dispatch(onAction, { action: 'clear', response: 'Filtros limpos', data: {} });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('Nenhum filtro ou busca ativa para limpar.');
  });

  it('"buscar" sem termo não anuncia busca', async () => {
    const onAction = await openVoiceAssistant(vi.fn());

    await dispatch(onAction, { action: 'search', response: 'Buscando', data: {} });

    expect(query().toString()).toBe('');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith('O comando de busca chegou sem o termo.');
  });

  it('"navegar" ativa a view pedida', async () => {
    const onNavigate = vi.fn();
    const onAction = await openVoiceAssistant(onNavigate);

    await dispatch(onAction, { action: 'navigate', response: 'Abrindo contatos', data: { route: 'contacts' } });

    expect(onNavigate).toHaveBeenCalledWith('contacts');
    expect(toast.success).toHaveBeenCalledWith('Navegando para contacts');
  });

  it('filtro que nenhuma lista consome avisa indisponibilidade, sem escrever nada', async () => {
    const onNavigate = vi.fn();
    const onAction = await openVoiceAssistant(onNavigate);

    await dispatch(onAction, {
      action: 'filter', response: 'Filtrando positivas', data: { filters: { sentiment: 'positive' } },
    });

    expect(query().toString()).toBe('');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith('Este filtro por voz não tem efeito nas listas.');
  });
});
