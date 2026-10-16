/**
 * Painel de contato no celular, iniciais e chip de sentimento (Inbox).
 *
 * Prova três defeitos reais, com o componente REAL:
 *
 *  1. LARGURA E ROLAGEM no celular — o sheet usava só `max-h-[85vh]` (altura
 *     automática), então o `h-full` da raiz de ContactDetails não resolvia e a
 *     área rolável (`overflow-y-auto`) ficava sem teto; e a raiz era `w-[323px]`
 *     fixo, deixando faixa vazia num aparelho de 390px. Aqui o sheet é montado
 *     de verdade (useIsMobile dublado) e medimos as classes que a folha e a raiz
 *     REALMENTE receberam, além do título/descrição que o Radix exige (sem eles
 *     o painel chega mudo ao leitor de tela).
 *
 *  2. INICIAIS — os dois cabeçalhos repetiam `name.split(' ').map(n => n[0])…`,
 *     que quebra em emoji (o par de surrogates partido) e não sobe a caixa
 *     ('joão silva' → 'js'). Agora usam o `getInitials` do formatters.
 *
 *  3. SENTIMENTO — era calculado por `normalizeSentiment` e nunca aparecia.
 *     O chip entra com TEXTO (não só cor), oculto quando o valor não tem
 *     rótulo, e o par tinta/fundo fecha AA (4,5:1) nos QUATRO temas — medido
 *     lendo os tokens de tokens.css/accessibility.css, como em y17Selos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EnrichedContactData } from '@/hooks/crm/useContactEnrichedData';
import type { Conversation } from '@/types/chat';

const h = vi.hoisted(() => ({
  isMobile: { value: true },
  reduceMotion: { value: false },
}));

vi.mock('@/hooks/ui/use-mobile', () => ({
  MOBILE_BREAKPOINT: 768,
  useIsMobile: () => h.isMobile.value,
}));

// Mantém `motion` real e troca só a preferência de movimento (padrão do
// LocationPicker.test.tsx).
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => h.reduceMotion.value,
}));

const supabase = vi.hoisted(() => ({
  eq: vi.fn(() => Promise.resolve({ error: null })),
  update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
  from: vi.fn(() => ({
    update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: async () => ({ data: null, error: null }) })) })),
  })),
  invoke: vi.fn(async () => ({ data: { ok: true }, error: null })),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: supabase.from, functions: { invoke: supabase.invoke }, auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } },
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/hooks/crm/useContactEnrichedData', () => ({ useContactEnrichedData: () => ({ enrichedData: null }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: (_key: string, fallback = false) => fallback }));
vi.mock('@/hooks/crm/useExternalContact360', () => ({ useExternalContact360: () => ({ data: null }) }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));
vi.mock('@/hooks/integrations/useSyncToCRM', () => ({ useSyncToCRM: () => ({ syncConversationAsync: vi.fn(), isSyncing: false, isConfigured: false }) }));
vi.mock('@/components/inbox/contact-details/sidebar/ContactSidebarSections', () => ({ ContactSidebarSections: () => null }));
vi.mock('@/components/inbox/contact-details/EditContactDialog', () => ({ EditContactDialog: () => null }));

import { ContactDetailsResponsive } from '../ContactDetailsResponsive';
import { ContactHeaderSection } from '../contact-details/ContactHeaderSection';
import { CompactContactHeader } from '../contact-details/CompactContactHeader';
import { getInitials } from '@/lib/formatters';

const conversa: Conversation = {
  id: 'conv1',
  contact: { id: 'c1', name: 'Maria Silva', phone: '+551****9999', tags: [], conversation_status: 'open' },
  unreadCount: 0,
  status: 'open',
  priority: 'low',
  tags: [],
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
} as Conversation;

const CONTATO = { id: 'c1', name: 'Maria Silva', phone: '+551****9999' };

const comSentimento = (ai_sentiment: unknown): EnrichedContactData =>
  ({ ai_sentiment } as EnrichedContactData);

/**
 * O painel real vive dentro de um provider de query na aplicação; a seção
 * "Entrega de mensagens" (16/10/2026) consulta a RPC `delivery_stats` no mount,
 * então o teste monta o mesmo contexto. Antes disso o painel passava sem provider
 * só porque todas as seções que consultam estavam desligadas por flag/mock.
 */
function renderResponsive() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContactDetailsResponsive conversation={conversa} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => { h.isMobile.value = true; h.reduceMotion.value = false; });
afterEach(() => cleanup());

// O jsdom não implementa scrollTo; o painel real chama no mount (mesmo dublê do
// ContactDetails.quickActions.test.tsx).
beforeAll(() => { Element.prototype.scrollTo = vi.fn(); });

// ───────────────────────── 1. Celular: largura, altura, a11y ────────────────
describe('ContactDetailsResponsive — painel no celular', () => {
  it('monta como sheet de altura definida e painel de largura total', () => {
    renderResponsive();

    const dialogo = screen.getByRole('dialog');
    expect(dialogo.className).toContain('h-[85vh]');

    const painel = screen.getByTestId('contact-panel');
    expect(painel.className).toContain('w-full');
    expect(painel.className).toContain('md:w-[323px]');
    // a área rolável vive DENTRO da raiz de altura definida → rola até a última seção
    expect(painel.querySelector('.overflow-y-auto')).not.toBeNull();
  });

  it('anuncia o painel ao leitor de tela (título + descrição ligados ao diálogo)', () => {
    renderResponsive();

    const descricao = screen.getByText('Dados do contato e histórico da conversa.');
    expect(descricao).toBeDefined();
    // Radix liga a descrição ao conteúdo por aria-describedby; sem ela o diálogo
    // é anunciado sem contexto.
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.getAttribute('aria-describedby')).toBe(descricao.getAttribute('id'));
    // o título (sr-only) também existe; o h3 interno traz o mesmo texto visível
    expect(screen.getAllByText('Detalhes do Contato').length).toBeGreaterThanOrEqual(1);
  });

  it('no desktop não monta sheet — o painel lateral continua igual', () => {
    h.isMobile.value = false;
    renderResponsive();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('contact-panel')).toBeDefined();
  });
});

// ───────────────────────── 2. Iniciais (code point, caixa) ───────────────────
describe('iniciais do contato', () => {
  it('getInitials sobe a caixa e não parte o emoji', () => {
    expect(getInitials('joão silva')).toBe('JS');
    expect(getInitials('Ana')).toBe('A');
    expect(getInitials('😀Ana')).toBe('😀');
    expect(getInitials('   ')).toBe('');
  });

  it('o cabeçalho compacto renderiza o emoji inteiro no avatar', () => {
    render(<CompactContactHeader contact={{ name: '😀Ana' }} isVip={false} firstName="😀Ana" />);
    expect(screen.getByTestId('compact-contact-initials').textContent).toBe('😀');
  });

  it('o cabeçalho completo usa o mesmo getInitials', () => {
    render(<ContactHeaderSection contact={{ ...CONTATO, name: 'joão silva' }} enrichedData={null} />);
    expect(screen.getByTestId('contact-avatar-initials').textContent).toBe('JS');
  });

  it('o compacto guarda o nome inteiro no title (nome exibido é truncado por CSS)', () => {
    render(<CompactContactHeader contact={{ name: 'Maria Aparecida de Souza Lima' }} isVip={false} firstName="Maria" />);
    expect(screen.getByText('Maria').getAttribute('title')).toBe('Maria Aparecida de Souza Lima');
  });
});

// ───────────────────────── 3. Chip de sentimento ─────────────────────────────
describe('chip de sentimento', () => {
  it.each([
    ['positivo', 'Positivo'],
    ['negativo', 'Negativo'],
    ['neutro', 'Neutro'],
    ['critico', 'Crítico'],
    // legado em inglês traduzido pelo vocabulário canônico
    ['positive', 'Positivo'],
  ])('mostra "%s" como %s', (valor, rotulo) => {
    render(<ContactHeaderSection contact={CONTATO} enrichedData={comSentimento(valor)} />);
    expect(screen.getByTestId('contact-sentiment-chip').textContent).toBe(rotulo);
  });

  it('não inventa sentimento quando o valor não tem rótulo canônico', () => {
    render(<ContactHeaderSection contact={CONTATO} enrichedData={comSentimento('very_positive')} />);
    expect(screen.queryByTestId('contact-sentiment-chip')).toBeNull();
  });

  it('some quando não há análise', () => {
    render(<ContactHeaderSection contact={CONTATO} enrichedData={null} />);
    expect(screen.queryByTestId('contact-sentiment-chip')).toBeNull();
  });
});

// ─────────────── 3b. Contraste AA do chip nos quatro temas ───────────────────
type RGB = [number, number, number];
const ler = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

function hslParaRgb(hg: number, s: number, l: number): RGB {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + hg / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}
const luminancia = ([r, g, b]: RGB): number => {
  const c = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const razao = (a: RGB, b: RGB): number => {
  const l1 = luminancia(a), l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const compor = (fundo: RGB, topo: RGB, alfa: number): RGB =>
  [0, 1, 2].map((i) => Math.round(fundo[i] * (1 - alfa) + topo[i] * alfa)) as RGB;

function tokensDoBloco(css: string, cabecalho: string): Record<string, RGB> {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const alvo = `${cabecalho} {`;
  const i = limpo.indexOf(alvo);
  if (i < 0) throw new Error(`bloco ${cabecalho} ausente`);
  const abre = i + alvo.length - 1;
  let nivel = 0;
  for (let j = abre; j < limpo.length; j++) {
    if (limpo[j] === '{') nivel += 1;
    else if (limpo[j] === '}') {
      nivel -= 1;
      if (nivel === 0) {
        const out: Record<string, RGB> = {};
        for (const t of limpo.slice(abre + 1, j).matchAll(/--([\w-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g)) {
          out[t[1]] = hslParaRgb(Number(t[2]), Number(t[3]), Number(t[4]));
        }
        return out;
      }
    }
  }
  throw new Error(`bloco ${cabecalho} sem fechamento`);
}

const TOKENS = ler('../../../styles/tokens.css');
const A11Y = ler('../../../styles/accessibility.css');
const CLARO = tokensDoBloco(TOKENS, ':root');
const ESCURO = { ...CLARO, ...tokensDoBloco(TOKENS, '.dark') };
const HC_CLARO = { ...CLARO, ...tokensDoBloco(A11Y, '.high-contrast') };
const HC_ESCURO = { ...ESCURO, ...tokensDoBloco(A11Y, '.high-contrast'), ...tokensDoBloco(A11Y, '.dark.high-contrast') };
const TEMAS = [['claro', CLARO], ['escuro', ESCURO], ['alto contraste', HC_CLARO], ['alto contraste escuro', HC_ESCURO]] as const;

/** Par tinta/fundo que o chip REALMENTE aplicou (classe `text-*`/`bg-*\/NN`). */
function parDoChip(el: Element): { texto: string; fundo: { token: string; alfa: number } } {
  let texto: string | null = null;
  let fundo: { token: string; alfa: number } | null = null;
  for (const bruta of (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) {
    const arbitravel = bruta.match(/^text-\[hsl\(var\(--([a-z0-9-]+)\)\)\]$/);
    if (arbitravel) { texto = arbitravel[1]; continue; }
    const nome = bruta.match(/^text-([a-z0-9-]+)$/);
    if (nome && !/^(2xs|3xs|xs|sm|base|lg|xl|2xl|3xl|4xl)$/.test(nome[1])) { texto = nome[1]; continue; }
    const bg = bruta.match(/^bg-([a-z0-9-]+)\/(\d+)$/);
    if (bg) fundo = { token: bg[1], alfa: Number(bg[2]) / 100 };
  }
  if (!texto) throw new Error(`chip sem cor de texto resolvível: ${el.getAttribute('class')}`);
  if (!fundo) throw new Error(`chip sem fundo tonal resolvível: ${el.getAttribute('class')}`);
  return { texto, fundo };
}

describe('Y17-5 — o chip de sentimento fecha AA (4,5:1) nos quatro temas', () => {
  it.each([['positivo', 'Positivo'], ['neutro', 'Neutro'], ['negativo', 'Negativo'], ['critico', 'Crítico']])(
    'par %s',
    (valor, rotulo) => {
      render(<ContactHeaderSection contact={CONTATO} enrichedData={comSentimento(valor)} />);
      const chip = screen.getByTestId('contact-sentiment-chip');
      expect(chip.textContent).toBe(rotulo);
      const { texto, fundo } = parDoChip(chip);
      for (const [tema, vars] of TEMAS) {
        expect(vars[texto], `token "${texto}" ausente em ${tema}`).toBeDefined();
        expect(vars[fundo.token], `token de fundo "${fundo.token}" ausente em ${tema}`).toBeDefined();
        const superficie = compor(vars['inbox-panel-bg'], vars[fundo.token], fundo.alfa);
        const r = Number(razao(vars[texto], superficie).toFixed(2));
        expect(r, `chip ${rotulo} — ${tema}: ${texto} sobre a tinta real`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});

// ───────────────────────── 4. Movimento reduzido ─────────────────────────────
describe('movimento reduzido — nada se desloca', () => {
  it('compacto: nasce no estado final quando o sistema pede menos movimento', () => {
    h.reduceMotion.value = true;
    render(<CompactContactHeader contact={{ name: 'Ana' }} isVip={false} firstName="Ana" />);
    const cabecalho = screen.getByTestId('compact-contact-header');
    expect(cabecalho.style.opacity).toBe('1');
    expect(cabecalho.style.transform).toBe('none');
  });

  it('compacto: controle — sem a preferência a entrada animada continua', () => {
    render(<CompactContactHeader contact={{ name: 'Ana' }} isVip={false} firstName="Ana" />);
    const cabecalho = screen.getByTestId('compact-contact-header');
    expect(cabecalho.style.opacity).toBe('0');
    expect(cabecalho.style.transform).toBe('translateY(-10px)');
  });

  it('cabeçalho completo: nada se desloca com menos movimento', () => {
    h.reduceMotion.value = true;
    render(<ContactHeaderSection contact={CONTATO} enrichedData={null} />);
    const cabecalho = screen.getByTestId('contact-header-section');
    expect(cabecalho.style.opacity).toBe('1');
    expect(cabecalho.style.transform).toBe('none');
  });
});
