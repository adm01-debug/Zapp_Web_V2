import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Item 271 / R2-AUTH-047 — "Aba Sons não persiste nem aplica nada".
//
// O painel instanciava um `useUserSettings()` PRÓPRIO, nunca chamava saveSettings
// e oferecia ids de som que o banco recusa ('default', 'pop', 'ding', 'bubble',
// 'none'). A tela confirmava uma configuração que os alertas nunca aplicavam.
//
// Este teste renderiza o painel REAL e prova, pelo UPSERT que ele dispara, que
// cada controle grava no hook canônico (`useNotificationSettings`) — o mesmo
// lido pelos alertas — e que nada fora de 'beep'|'chime'|'bell'|'alert'|'soft'
// chega ao banco. Dados 100% sintéticos.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  // Linha sintética de user_settings (nenhum dado real de ninguém).
  row: {} as Record<string, unknown>,
  upsert: vi.fn(),
  upload: vi.fn(),
  previewSound: vi.fn(),
  toastFalha: vi.fn(),
}));

const LINHA_SINTETICA: Record<string, unknown> = {
  sound_enabled: true,
  sound_volume: 60,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  message_sound_type: 'chime',
  mention_sound_type: 'bell',
  sla_sound_type: 'alert',
  goal_sound_type: 'chime',
  transcription_sound_type: 'soft',
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: h.row, error: null }),
        }),
      }),
      upsert: h.upsert,
    }),
    storage: { from: () => ({ upload: h.upload }) },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-sintetico-001' } }),
  AuthProvider: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Aviso de falha do hook canônico (é ele que a tela ouve quando o upsert volta com erro).
vi.mock('@/hooks/ui/use-toast', () => ({
  toast: h.toastFalha,
  useToast: () => ({ toast: h.toastFalha }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/utils/notificationSounds', () => ({
  previewSound: h.previewSound,
  playNotificationSound: vi.fn(),
}));

// Primitivas Radix pesadas em jsdom: trocadas por controles nativos que repassam
// o evento do usuário para o handler REAL do componente (mesmo padrão de
// CatalogAdvancedFilters.test.tsx / SkillBasedRoutingSettings.test.tsx).
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: ReactNode;
  }) => (
    <select value={value ?? ''} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock('@/components/ui/slider', () => ({
  Slider: ({
    value,
    min,
    max,
    step,
    thumbLabel,
    onValueChange,
  }: {
    value?: number[];
    min?: number;
    max?: number;
    step?: number;
    thumbLabel?: string;
    onValueChange?: (v: number[]) => void;
  }) => (
    <input
      type="range"
      data-testid="sound-volume-slider"
      aria-label={thumbLabel ?? 'volume'}
      min={min}
      max={max}
      step={step}
      value={value?.[0] ?? 0}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
    />
  ),
}));

import { SoundCustomizationPanel } from '../SoundCustomizationPanel';

/** Ordem das categorias no DOM — a MESMA de SOUND_CATEGORIES no painel. */
const CATEGORIAS = ['message', 'mention', 'sla', 'goal', 'transcription'] as const;
/** Categoria da tela -> coluna do banco (o hook faz esse mapeamento). */
const CAMPO_NO_BANCO: Record<string, string> = {
  message: 'message_sound_type',
  mention: 'mention_sound_type',
  sla: 'sla_sound_type',
  goal: 'goal_sound_type',
  transcription: 'transcription_sound_type',
};

const CANONICOS = ['beep', 'chime', 'bell', 'alert', 'soft'];

const renderPainel = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SoundCustomizationPanel />
    </QueryClientProvider>,
  );
};

const selects = () => Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
const selectDa = (categoria: string) => selects()[CATEGORIAS.indexOf(categoria as (typeof CATEGORIAS)[number])];

/** Volume 60 (default é 70): só pode aparecer quando a linha do banco chegou. */
const esperarPainelCarregado = async () => {
  await waitFor(() =>
    expect((screen.getByTestId('sound-volume-slider') as HTMLInputElement).value).toBe('60'),
  );
};

const botoesPlay = () =>
  Array.from(document.querySelectorAll('button')).filter((b) => b.querySelector('svg.lucide-play'));

describe('SoundCustomizationPanel — grava no hook canônico dos alertas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.row = { ...LINHA_SINTETICA };
    h.upsert.mockResolvedValue({ error: null });
    h.upload.mockResolvedValue({
      data: { path: 'custom-sounds/1759700000000-meu-som.mp3' },
      error: null,
    });
  });

  it('1. trocar o som de "Mensagens" para bell grava message_sound_type no banco', async () => {
    renderPainel();
    await esperarPainelCarregado();

    fireEvent.change(selectDa('message'), { target: { value: 'bell' } });

    await waitFor(() => expect(h.upsert).toHaveBeenCalled());
    expect(h.upsert.mock.calls[0][0]).toMatchObject({
      user_id: 'u-sintetico-001',
      message_sound_type: 'bell',
    });
  });

  it('2. desligar "Sons habilitados" grava sound_enabled=false', async () => {
    renderPainel();
    await esperarPainelCarregado();

    fireEvent.click(screen.getByRole('switch', { name: 'Sons habilitados' }));

    await waitFor(() => expect(h.upsert).toHaveBeenCalled());
    expect(h.upsert.mock.calls[0][0]).toMatchObject({ sound_enabled: false });
  });

  it('3. o Volume geral mostra o valor gravado e grava o valor do controle (10–100, passo 5)', async () => {
    renderPainel();
    await esperarPainelCarregado();

    const slider = screen.getByTestId('sound-volume-slider') as HTMLInputElement;
    expect(slider.min).toBe('10');
    expect(slider.max).toBe('100');
    expect(slider.step).toBe('5');
    expect(slider.value).toBe('60');

    fireEvent.change(slider, { target: { value: '35' } });

    await waitFor(() => expect(h.upsert).toHaveBeenCalled());
    expect(h.upsert.mock.calls[0][0]).toMatchObject({ sound_volume: 35 });
  });

  it('4. ligar o Horário silencioso e mudar o início grava quiet_hours_enabled/quiet_hours_start', async () => {
    renderPainel();
    await esperarPainelCarregado();

    fireEvent.click(screen.getByRole('switch', { name: 'Horário silencioso' }));

    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(1));
    expect(h.upsert.mock.calls[0][0]).toMatchObject({ quiet_hours_enabled: true });

    const inicio = (await screen.findByLabelText('Início do horário silencioso')) as HTMLInputElement;
    expect(inicio.value).toBe('22:00');

    fireEvent.change(inicio, { target: { value: '23:30' } });

    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(2));
    expect(h.upsert.mock.calls[1][0]).toMatchObject({ quiet_hours_start: '23:30' });
  });

  it('5. a tela só oferece os 5 tipos do banco e nenhum upsert sai fora do vocabulário', async () => {
    renderPainel();
    await esperarPainelCarregado();

    // A UI não pode mais oferecer 'default', 'pop', 'ding', 'bubble' nem 'Silencioso'/'none'.
    for (const select of selects()) {
      expect(Array.from(select.options).map((o) => o.value).sort()).toEqual([...CANONICOS].sort());
    }

    // Troca o som das 5 categorias por um tipo diferente do atual e confere o que foi para o upsert.
    const trocas: [string, string][] = [
      ['message', 'beep'],
      ['mention', 'soft'],
      ['sla', 'beep'],
      ['goal', 'alert'],
      ['transcription', 'beep'],
    ];
    for (let i = 0; i < trocas.length; i++) {
      const [categoria, tipo] = trocas[i];
      fireEvent.change(selectDa(categoria), { target: { value: tipo } });
      await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(i + 1));
      expect(h.upsert.mock.calls[i][0]).toMatchObject({ [CAMPO_NO_BANCO[categoria]]: tipo });
    }

    const gravados = h.upsert.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .flatMap((p) => Object.entries(p).filter(([k]) => k.endsWith('_sound_type')).map(([, v]) => v));
    expect(gravados).toHaveLength(5);
    gravados.forEach((v) => expect(CANONICOS).toContain(v));
  });

  it('6. quando o upsert falha, avisa e a tela NÃO fica confirmada (volta ao valor gravado)', async () => {
    h.upsert.mockResolvedValue({ error: new Error('falha de rede') });
    renderPainel();
    await esperarPainelCarregado();

    fireEvent.change(selectDa('message'), { target: { value: 'bell' } });

    await waitFor(() =>
      expect(h.toastFalha).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })),
    );
    await waitFor(() => expect(selectDa('message').value).toBe('chime'));
    expect(selectDa('message').value).not.toBe('bell');
  });

  it('7. o preview toca o som real no volume real: previewSound(tipo do cartão, settings.soundVolume)', async () => {
    renderPainel();
    await esperarPainelCarregado();

    expect(botoesPlay()).toHaveLength(5);

    fireEvent.click(botoesPlay()[0]); // primeiro cartão = Mensagens (message_sound_type: 'chime')

    await waitFor(() => expect(h.previewSound).toHaveBeenCalledWith('chime', 60));
  });

  it('8. com "Sons habilitados" desligado o preview não toca nada', async () => {
    h.row = { ...LINHA_SINTETICA, sound_enabled: false };
    renderPainel();
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Sons habilitados' })).toHaveAttribute(
        'aria-checked',
        'false',
      ),
    );

    fireEvent.click(botoesPlay()[0]);

    expect(h.previewSound).not.toHaveBeenCalled();
  });

  it('9. o upload guarda o caminho do storage e diz que o arquivo NÃO está aplicado', async () => {
    renderPainel();
    await esperarPainelCarregado();

    const input = document.getElementById('custom-sound-upload') as HTMLInputElement;
    const arquivo = new File(['audio-sintetico'], 'meu-som.mp3', { type: 'audio/mpeg' });
    fireEvent.change(input, { target: { files: [arquivo] } });

    await waitFor(() => expect(h.upload).toHaveBeenCalled());
    expect(h.upload.mock.calls[0][0]).toContain('meu-som.mp3');

    const status = await screen.findByTestId('custom-sound-status');
    expect(status.textContent).toContain('custom-sounds/1759700000000-meu-som.mp3');
    expect(status.textContent).toMatch(/enviado/i);
    expect(status.textContent).toMatch(/n[ãa]o é aplicado aos alertas/i);
    // O upload não pode virar preferência: nenhum som por categoria é gravado por ele.
    expect(h.upsert).not.toHaveBeenCalled();
  });

  // Ponto fraco da área: mudei a escala do Volume geral (era um useState(80) local, virou a
  // faixa canônica 10–100 do hook). O pior e o melhor caso, na tela, têm de refletir o que o
  // hook guarda — não um estado local.
  it('10. o Volume geral reflete o teto e o piso do hook (10–100), nunca um estado local', async () => {
    h.row = { ...LINHA_SINTETICA, sound_volume: 500 }; // acima do teto: o hook clampa em 100
    const primeiro = renderPainel();
    await waitFor(() =>
      expect((screen.getByTestId('sound-volume-slider') as HTMLInputElement).value).toBe('100'),
    );
    expect(screen.getByText('100%')).toBeInTheDocument();
    primeiro.unmount();

    h.row = { ...LINHA_SINTETICA, sound_volume: 4 }; // abaixo do piso: o hook clampa em 10
    renderPainel();
    await waitFor(() =>
      expect((screen.getByTestId('sound-volume-slider') as HTMLInputElement).value).toBe('10'),
    );
    expect(screen.getByText('10%')).toBeInTheDocument();
  });
});
