/**
 * F5 do plano de Contatos (D4): legados ficam fora por padrão. O front só envia
 * `include_legacy` quando o toggle está ligado — sem ele a RPC usa o default (false).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: [], error: null })) }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { ContactService } from '../contact.service';

describe('ContactService — include_legacy (F5)', () => {
  beforeEach(() => rpc.mockClear());

  it('searchContacts não envia include_legacy com o toggle desligado', async () => {
    await ContactService.searchContacts({ search_term: 'ana' });
    expect(rpc).toHaveBeenCalledWith('search_contacts', expect.not.objectContaining({ include_legacy: expect.anything() }));
  });

  it('searchContacts envia include_legacy=true com o toggle ligado', async () => {
    await ContactService.searchContacts({ search_term: 'ana', include_legacy: true });
    expect(rpc).toHaveBeenCalledWith('search_contacts', expect.objectContaining({ include_legacy: true }));
  });

  it('getCountsByType segue o mesmo critério', async () => {
    await ContactService.getCountsByType();
    expect(rpc).toHaveBeenLastCalledWith('contacts_count_by_type', {});
    await ContactService.getCountsByType(true);
    expect(rpc).toHaveBeenLastCalledWith('contacts_count_by_type', { include_legacy: true });
  });
});
