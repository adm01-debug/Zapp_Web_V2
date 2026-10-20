/**
 * A4-D (auditoria adversarial, onda 2): o editor de contato abria com endereço vazio porque a
 * query `contact-enriched` não pedia NENHUMA das 6 colunas de endereço da tabela `contacts`.
 * Com o campo vazio, salvar qualquer outra alteração grava o endereço como nulo (perda de dado).
 */
import { describe, expect, it, vi } from 'vitest';

const { colunasPedidas } = vi.hoisted(() => ({ colunasPedidas: [] as string[] }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: (cols: string) => {
        colunasPedidas.push(cols);
        return { eq: () => ({ single: async () => ({ data: null, error: null }) }) };
      },
    }),
  },
}));

import { ContactService } from '../contact.service';

describe('ContactService.fetchEnrichedData — endereço (A4-D)', () => {
  it('pede as 6 colunas de endereço', async () => {
    await ContactService.fetchEnrichedData('c1');

    const cols = colunasPedidas[colunasPedidas.length - 1] ?? '';
    for (const coluna of ['address', 'address_number', 'city', 'neighborhood', 'postal_code', 'state']) {
      expect(cols, `faltou pedir "${coluna}"`).toContain(coluna);
    }
  });

  it('continua pedindo os campos que já existiam (nada regride)', async () => {
    await ContactService.fetchEnrichedData('c1');

    const cols = colunasPedidas[colunasPedidas.length - 1] ?? '';
    for (const coluna of ['company', 'job_title', 'nickname', 'surname', 'contact_type']) {
      expect(cols).toContain(coluna);
    }
  });

  // Item 5: sem a coordenada na query o editor abre com lat/lng vazios mesmo quando o contato tem.
  it('pede latitude/longitude (item 5)', async () => {
    await ContactService.fetchEnrichedData('c1');

    const cols = colunasPedidas[colunasPedidas.length - 1] ?? '';
    for (const coluna of ['latitude', 'longitude']) {
      expect(cols, `faltou pedir "${coluna}"`).toContain(coluna);
    }
  });
});
