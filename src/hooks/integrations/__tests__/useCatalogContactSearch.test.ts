import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CONTACT_SEARCH_MIN_CHARS,
  buildContactSearchFilter,
  contactSearchDigits,
  logCatalogSendEvent,
  type CatalogSendEventInput,
} from '../useCatalogContactSearch';

// CT-78 — o cliente Supabase é a ÚNICA dependência externa de
// `logCatalogSendEvent`; é ele que muda (não a função sob teste). `insert` é um
// thenable que resolve `{ error }`, exatamente como o builder do PostgREST.
const { mockFrom, mockInsert } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const BASE_INPUT: CatalogSendEventInput = {
  productId: 'p1',
  productName: 'Caneta Azul',
  productSku: 'PO-13153',
  variantLabel: 'Azul',
  contactId: 'c1',
  agentId: 'agent-1',
  template: 'informal',
  imagesCount: 3,
  messageLength: 42,
  status: 'partial',
  messageIds: ['m1', 'm2'],
};

const LAST_PAYLOAD = () => mockInsert.mock.calls[0][0] as Record<string, unknown>;

describe('logCatalogSendEvent — CT-78 (implementação real, sem mock da função)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockInsert.mockReset();
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('grava em catalog_send_events com o payload snake_case completo', async () => {
    await logCatalogSendEvent(BASE_INPUT);

    expect(mockFrom).toHaveBeenCalledWith('catalog_send_events');
    expect(mockInsert).toHaveBeenCalledWith({
      product_id: 'p1',
      product_name: 'Caneta Azul',
      product_sku: 'PO-13153',
      variant_label: 'Azul',
      contact_id: 'c1',
      agent_id: 'agent-1',
      template: 'informal',
      images_count: 3,
      message_length: 42,
      status: 'partial',
      message_ids: ['m1', 'm2'],
    });
  });

  it('campos opcionais ausentes viram null (nunca undefined)', async () => {
    await logCatalogSendEvent({
      productId: 'p2',
      productName: 'Só o mínimo',
      contactId: 'c2',
      imagesCount: 0,
      messageLength: 0,
      status: 'failed',
      messageIds: [],
    });

    const payload = LAST_PAYLOAD();
    expect(payload.product_sku).toBeNull();
    expect(payload.variant_label).toBeNull();
    expect(payload.agent_id).toBeNull();
    expect(payload.template).toBeNull();
    // `images_count`/`message_length` são números reais (0), não null.
    expect(payload.images_count).toBe(0);
    expect(payload.message_length).toBe(0);
  });

  it('aceita os 3 status possíveis sem transformá-los', async () => {
    for (const status of ['sent', 'partial', 'failed'] as const) {
      await logCatalogSendEvent({ ...BASE_INPUT, status });
    }

    expect(mockInsert.mock.calls.map((c) => (c[0] as { status: string }).status)).toEqual([
      'sent',
      'partial',
      'failed',
    ]);
  });

  it('resolve sem lançar e não loga quando o insert tem sucesso', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(logCatalogSendEvent(BASE_INPUT)).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('falha silenciosa: insert com erro resolve void (não rejeita) e loga a mensagem', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'duplicate key value violates unique constraint' } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(logCatalogSendEvent(BASE_INPUT)).resolves.toBeUndefined();

    const logged = errorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(logged).toContain('Falha ao registrar evento de envio do catálogo:');
    expect(logged).toContain('duplicate key value violates unique constraint');
  });
});

describe('buildContactSearchFilter — CT-43 (busca de contato)', () => {
  it('abaixo do mínimo de 2 caracteres não monta filtro nenhum', () => {
    expect(CONTACT_SEARCH_MIN_CHARS).toBe(2);
    expect(buildContactSearchFilter('')).toBeNull();
    expect(buildContactSearchFilter(' ')).toBeNull();
    expect(buildContactSearchFilter('t')).toBeNull();
    expect(buildContactSearchFilter(' t ')).toBeNull();
    // 2 caracteres já valem.
    expect(buildContactSearchFilter('to')).not.toBeNull();
  });

  it('busca por nome a partir de 2 caracteres', () => {
    expect(buildContactSearchFilter('tom')).toBe('name.ilike."%tom%"');
  });

  it('normaliza o telefone para apenas dígitos', () => {
    expect(contactSearchDigits('+55 (41) 9 9999')).toBe('554199999');
    expect(contactSearchDigits('9999')).toBe('9999');
    expect(contactSearchDigits('tom')).toBe('');
  });

  it('acha um contato armazenado como "+55 (41) 9 9999" buscando "9999"', () => {
    const stored = '+55 (41) 9 9999';
    const digits = contactSearchDigits('9999');

    // O `ilike` do PostgREST compara substring: a linha só precisa conter os
    // dígitos do termo — antes o filtro mandava a máscara digitada crua.
    expect(stored.includes(digits)).toBe(true);

    const filter = buildContactSearchFilter('9999');
    expect(filter).toContain(`phone.ilike."%${digits}%"`);
    expect(filter).toContain('name.ilike."%9999%"');
  });

  it('termo só com letras não gera cláusula de telefone ("%%" casaria toda a base)', () => {
    expect(buildContactSearchFilter('tom')).not.toContain('phone.ilike');
    expect(buildContactSearchFilter('tom')).not.toContain('%%');
  });

  it('escapa o termo para não quebrar a gramática do or()', () => {
    expect(buildContactSearchFilter('a,b')).toBe('name.ilike."%a,b%"');
    expect(buildContactSearchFilter('a"b')).toBe('name.ilike."%a\\"b%"');
  });
});
