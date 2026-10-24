import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// R2-AUTH-038 · item 262: o mapa contava o contato COM coordenada também como
// "aproximado pelo DDD" — a mesma pessoa aparecia em "Endereço confirmado" e em
// "Aproximado pelo DDD" (e inflava o total do mapa). O teste monta a tela real
// (ContactMapView → ContactRegionMap) com um contato preciso, um só DDD e um de
// região sem ponto conhecido, e cobra conjuntos exclusivos.
const h = vi.hoisted(() => ({ invoke: vi.fn(), loadMapbox: vi.fn(), reportClientError: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => h.invoke(...a) } } }));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: (...a: unknown[]) => h.reportClientError(...a) }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
// O desenho do mapa não interessa aqui: o que se prova é o conjunto de contatos que a
// tela publica nas contagens. O loader fica pendente e a legenda renderiza do mesmo jeito.
vi.mock('@/lib/mapboxLoader', () => ({ loadMapbox: () => h.loadMapbox() }));

import { ContactMapView } from '../ContactMapView';
import { resetMapboxTokenForTests } from '@/lib/mapboxToken';

const contacts = [
  // Precisa (autocomplete de endereço): pino próprio no mapa.
  { id: 'c-preciso', name: 'Contato com endereço', phone: '5511999999999', latitude: -23.55, longitude: -46.63 },
  // Sem coordenada: só a bolha aproximada do DDD (mesma região do preciso).
  { id: 'c-aproximado', name: 'Contato só DDD', phone: '5511988888888' },
  // DDD sem ponto conhecido: não entra no mapa, só no cartão.
  { id: 'c-sem-ponto', name: 'Contato DDD 10', phone: '5510999999999' },
];

describe('ContactMapView — mapa x localização (R2-AUTH-038)', () => {
  beforeEach(() => {
    h.invoke.mockReset();
    h.invoke.mockResolvedValue({ data: { token: 'pk.test' }, error: null });
    h.loadMapbox.mockReset();
    h.loadMapbox.mockReturnValue(new Promise(() => {}));
    h.reportClientError.mockReset();
    resetMapboxTokenForTests();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('não conta o contato com coordenada como aproximado: as duas populações do mapa são exclusivas', () => {
    render(<ContactMapView contacts={contacts} />);

    // O preciso aparece UMA vez, no conjunto de endereço confirmado...
    expect(screen.getByText('Endereço confirmado (1)')).toBeInTheDocument();
    // ...e o "Aproximado pelo DDD" só leva quem NÃO tem coordenada (antes vinha 2: os dois
    // contatos de São Paulo, inclusive o que já estava pinado pelo endereço).
    expect(screen.getByText('Aproximado pelo DDD (1)')).toBeInTheDocument();
    // Numa conta só, 3 contatos mapeados: 1 confirmado + 1 aproximado + 1 região sem ponto
    // conhecido (que fica nos cartões). Nenhum contato conta duas vezes.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('contatos mapeados')).toBeInTheDocument();
  });

  it('mantém o agrupamento comercial por DDD nos cartões, com todos os contatos', () => {
    render(<ContactMapView contacts={contacts} />);

    // O cartão é comercial: segue contando os 2 contatos de São Paulo (o preciso e o só DDD)...
    expect(screen.getByText('São Paulo - SP')).toBeInTheDocument();
    expect(screen.getByText('2 contatos')).toBeInTheDocument();
    // ...e o DDD sem ponto conhecido também continua listado.
    expect(screen.getByText('DDD 10')).toBeInTheDocument();
    expect(screen.getByText('1 contato')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 regiões
    expect(screen.getByText('regiões')).toBeInTheDocument();
  });
});
