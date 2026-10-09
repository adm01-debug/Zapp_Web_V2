/**
 * SL-114 / E74 — alvo de toque dos rótulos de 9–10 px que são clicáveis.
 *
 * O inventário da auditoria de fontes (E74) pede o "mínimo de toque/alvo nos rótulos de 9–10 px
 * que são clicáveis". Um botão cujo alvo é SÓ o texto do rótulo (sem altura nem padding)
 * media ~13 px de altura — o dedo erra o alvo e acerta o vizinho. O projeto já resolveu isso
 * antes com a utilitária `min-h-11` (2,75 rem = 44 px; ver
 * `src/components/inbox/location-picker/__tests__/SuggestionList.test.tsx`, bloco E61).
 *
 * Aqui cada teste RENDERIZA O COMPONENTE REAL da tela (o picker/atalho de verdade, com o
 * hook de dados mockado — o hook é a fronteira, não o componente) e:
 *   1. exige o alvo de 44 px (`min-h-11`) no botão do rótulo;
 *   2. quando o clique tem efeito visível, prova o comportamento (o rótulo some porque a
 *      categoria sugerida passou a ser a selecionada / o handler foi chamado).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const h = vi.hoisted(() => ({
  useAudioMemes: vi.fn(),
  useCustomEmojis: vi.fn(),
  useUniversityHelp: vi.fn(),
}));

vi.mock('@/hooks/communication/useAudioMemes', () => ({
  useAudioMemes: h.useAudioMemes,
  formatDuration: () => '0:10',
}));
vi.mock('@/hooks/integrations/useCustomEmojis', () => ({
  useCustomEmojis: h.useCustomEmojis,
}));
vi.mock('@/hooks/ui/useUniversityHelp', () => ({
  useUniversityHelp: h.useUniversityHelp,
}));

import { AudioMemePicker } from '../AudioMemePicker';
import { CustomEmojiPicker } from '../CustomEmojiPicker';
import { UniversityHelp } from '../UniversityHelp';
import { PeriodFilterSelector } from '../ai-tools/PeriodFilterSelector';
import { StickerUploadPreview } from '../stickers/StickerUploadPreview';

const ALVO_MINIMO = 'min-h-11';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('E74 — "IA sugere" (rótulo de 9 px) tem alvo de toque de 44 px', () => {
  it('AudioMemePicker: o botão do rótulo tem min-h-11 e o clique aplica a categoria', () => {
    h.useAudioMemes.mockReturnValue({
      memes: [],
      loading: false,
      uploading: false,
      playingId: null,
      pendingUpload: {
        file: new File([], 'meme.mp3'),
        audioUrl: 'blob:meme',
        storagePath: 'audio-memes/meme.mp3',
        duration: 3,
        aiCategory: 'risada',
        selectedCategory: 'outros',
        name: 'Meme',
      },
      audioRef: { current: null },
      fileInputRef: { current: null },
      handlePreview: vi.fn(),
      handleFileSelect: vi.fn(),
      handleConfirmUpload: vi.fn(),
      handleCancelUpload: vi.fn(),
      handleSend: vi.fn(),
      toggleFavorite: vi.fn(),
      handleCategoryChange: vi.fn(),
      handleDelete: vi.fn(),
      cleanup: vi.fn(),
    });
    render(
      <TooltipProvider>
        <AudioMemePicker onSendAudio={vi.fn()} />
      </TooltipProvider>
    );

    // O botão de upload só existe com o popover aberto — abre pelo gatilho real da tela.
    fireEvent.click(screen.getByRole('button', { name: 'Áudio Memes' }));

    const rotulo = screen.getByRole('button', { name: /IA sugere: Risada/i });
    expect(rotulo.className).toContain(ALVO_MINIMO);

    // Comportamento: clicar troca a categoria para a sugerida — o rótulo deixa de fazer sentido.
    fireEvent.click(rotulo);
    expect(screen.queryByRole('button', { name: /IA sugere/i })).toBeNull();
  });

  it('CustomEmojiPicker: o botão do rótulo tem min-h-11 e o clique aplica a categoria', () => {
    h.useCustomEmojis.mockReturnValue({
      emojis: [],
      loading: false,
      uploading: false,
      pendingUpload: {
        file: new File([], 'emoji.png'),
        imageUrl: 'blob:emoji',
        storagePath: 'custom-emojis/emoji.png',
        aiCategory: 'riso',
        selectedCategory: 'sorriso',
        name: 'Emoji',
      },
      fileInputRef: { current: null },
      handleFileSelect: vi.fn(),
      handleConfirmUpload: vi.fn(),
      handleCancelUpload: vi.fn(),
      handleSend: vi.fn(),
      toggleFavorite: vi.fn(),
      handleCategoryChange: vi.fn(),
      handleDelete: vi.fn(),
      setPendingUpload: vi.fn(),
    });
    render(
      <TooltipProvider>
        <CustomEmojiPicker onSendEmoji={vi.fn()} />
      </TooltipProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Emojis Personalizados' }));
    // A pré-visualização do upload vive na aba de emojis próprios.
    fireEvent.click(screen.getByRole('button', { name: /Customizados/i }));

    const rotulo = screen.getByRole('button', { name: /IA sugere: Riso/i });
    expect(rotulo.className).toContain(ALVO_MINIMO);

    fireEvent.click(rotulo);
    expect(screen.queryByRole('button', { name: /IA sugere/i })).toBeNull();
  });

  it('StickerUploadPreview: o botão do rótulo tem min-h-11 e o clique aplica a categoria', () => {
    render(
      <StickerUploadPreview
        pending={{
          file: new File([], 'figurinha.png'),
          imageUrl: 'blob:figurinha',
          storagePath: 'stickers/figurinha.png',
          aiCategory: 'riso',
          selectedCategory: 'pessoal',
          name: 'Figurinha',
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const rotulo = screen.getByRole('button', { name: /Usar sugestão da IA: Riso/i });
    expect(rotulo.className).toContain(ALVO_MINIMO);

    fireEvent.click(rotulo);
    expect(screen.queryByRole('button', { name: /Usar sugestão da IA/i })).toBeNull();
    // O seletor passou a mostrar a categoria sugerida — prova que o clique agiu.
    expect(screen.getByRole('button', { name: /Categoria: Riso/i })).toBeTruthy();
  });
});

describe('E74 — atalhos de 10 px ("Todos/Limpar", "Limpar datas") têm alvo de 44 px', () => {
  it('UniversityHelp: o atalho do cabeçalho tem min-h-11 e dispara selectAll', () => {
    const selectAll = vi.fn();
    const mensagens = [{ id: 'm1', content: 'oi', sender: 'client', timestamp: '2026-10-08T10:00:00Z' }];
    h.useUniversityHelp.mockReturnValue({
      selectedIds: new Set(['m1']),
      loading: false,
      response: null,
      selectedTone: 'profissional',
      setSelectedTone: vi.fn(),
      error: null,
      filterMode: 'all',
      setFilterMode: vi.fn(),
      filteredMessages: mensagens,
      periodFilter: {
        analysisPeriod: 'all',
        setAnalysisPeriod: vi.fn(),
        customDateFrom: undefined,
        customDateTo: undefined,
        setCustomDateFrom: vi.fn(),
        setCustomDateTo: vi.fn(),
        clearCustomDates: vi.fn(),
        filteredMessages: [],
      },
      toggleMessage: vi.fn(),
      selectAll,
      generateResponse: vi.fn(),
      handleRegenerate: vi.fn(),
      lastCallRef: { current: 0 },
    });
    render(<UniversityHelp contactId="c1" contactName="Contato" messages={mensagens} />);

    const atalho = screen.getByRole('button', { name: /^Limpar$/ });
    expect(atalho.className).toContain(ALVO_MINIMO);

    fireEvent.click(atalho);
    expect(selectAll).toHaveBeenCalledTimes(1);
  });

  it('PeriodFilterSelector: o atalho "Limpar datas" tem min-h-11 e dispara onClearCustom', () => {
    const onClearCustom = vi.fn();
    const onPeriodChange = vi.fn();
    render(
      <PeriodFilterSelector
        period="custom"
        onPeriodChange={onPeriodChange}
        customFrom={new Date('2026-10-01T00:00:00Z')}
        customTo={undefined}
        onCustomFromChange={vi.fn()}
        onCustomToChange={vi.fn()}
        onClearCustom={onClearCustom}
        filteredCount={1}
        totalCount={1}
      />
    );

    // O atalho vive dentro do popover: abre pelo gatilho real.
    fireEvent.click(screen.getAllByRole('button')[0]);
    const atalho = screen.getByRole('button', { name: /Limpar datas/i });
    expect(atalho.className).toContain(ALVO_MINIMO);

    fireEvent.click(atalho);
    expect(onClearCustom).toHaveBeenCalledTimes(1);
  });
});
