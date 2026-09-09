import {
  isExpectedExternalAnonKey, isExpectedExternalServerKey, isExpectedExternalUrl, normalizePhone, parseSyncResult, validateMutation, validateRpc, validIdentifier,
  extractContact360Id,
} from '../crm-integration-contract.ts';

Deno.test('normalizes valid phones and rejects malformed values', () => {
  if (normalizePhone('+55 (11) 99999-0000') !== '5511999990000') throw new Error('normalization failed');
  for (const value of ['', '123', '1234567890123456', null, {}]) {
    if (normalizePhone(value) !== null) throw new Error(`accepted invalid phone: ${String(value)}`);
  }
});

Deno.test('external configuration is pinned to the companies CRM project', () => {
  if (!isExpectedExternalUrl('https://pgxfvjmuubtbowutlide.supabase.co')) throw new Error('expected URL rejected');
  if (isExpectedExternalUrl('https://attacker.example.com')) throw new Error('foreign URL accepted');
  if (isExpectedExternalUrl('https://pgxfvjmuubtbowutlide.supabase.co:444')) throw new Error('custom port accepted');
  if (isExpectedExternalUrl('https://pgxfvjmuubtbowutlide.supabase.co/?redirect=1')) throw new Error('query accepted');
  const payload = btoa(JSON.stringify({ ref: 'pgxfvjmuubtbowutlide', role: 'anon' })).replace(/=/g, '');
  if (!isExpectedExternalAnonKey(`header.${payload}.signature`)) throw new Error('expected key rejected');
  if (isExpectedExternalServerKey(`header.${payload}.signature`)) throw new Error('anon key accepted as server key');
  const wrong = btoa(JSON.stringify({ ref: 'other', role: 'service_role' })).replace(/=/g, '');
  if (isExpectedExternalAnonKey(`header.${wrong}.signature`)) throw new Error('foreign key accepted');
  const service = btoa(JSON.stringify({ ref: 'pgxfvjmuubtbowutlide', role: 'service_role' })).replace(/=/g, '');
  if (!isExpectedExternalServerKey(`header.${service}.signature`)) throw new Error('expected service key rejected');
});

Deno.test('RPC contract is fail-closed', () => {
  if (validateRpc('get_contact_360_by_phone', { p_phone: '5511999990000' })) throw new Error('valid RPC rejected');
  if (!validateRpc('unknown_rpc', {})) throw new Error('unknown RPC accepted');
  if (!validateRpc('get_companies_by_phones_batch', { p_phones: Array(101).fill('5511999990000') })) throw new Error('oversized batch accepted');
  if (!validateRpc('search_contacts_advanced', { p_page: -1, p_page_size: 1000 })) throw new Error('invalid pagination accepted');
  if (!validateRpc('get_contact_360_by_phone', { p_phone: '5511999990000', injected: true })) throw new Error('unknown param accepted');
  if (!validateRpc('search_contacts_advanced', { p_sort_by: 'raw_sql' })) throw new Error('unknown sort accepted');
  for (const sort of ['relevance', 'name', 'recent', 'relationship_score']) {
    if (validateRpc('search_contacts_advanced', { p_sort_by: sort })) throw new Error(`valid sort rejected: ${sort}`);
  }
  for (const sort of ['score', 'compras', 'pedidos']) {
    if (!validateRpc('search_contacts_advanced', { p_sort_by: sort })) throw new Error(`legacy invalid sort accepted: ${sort}`);
  }
  if (!validateRpc('search_contacts_advanced', { p_search: { injected: true } })) throw new Error('object search accepted');
  if (!validateRpc('get_contact_360_by_phone', { p_phone: '5'.repeat(1_000_000) })) throw new Error('oversized phone accepted');
});

Deno.test('mutation contract limits tables, actions, fields and match', () => {
  if (validateMutation('companies', 'insert', { nome_fantasia: 'ACME' }, undefined)) throw new Error('valid insert rejected');
  if (validateMutation('contacts', 'update', { first_name: 'Ana' }, { id: 'id-1' })) throw new Error('valid update rejected');
  if (!validateMutation('contacts', 'delete', {}, { id: 'id-1' })) throw new Error('delete accepted');
  if (!validateMutation('contacts', 'update', { admin: true }, { id: 'id-1' })) throw new Error('unknown field accepted');
  if (!validateMutation('companies', 'update', { status: 'ativo' }, { id: 'a', tenant: 'b' })) throw new Error('broad match accepted');
  if (!validateMutation('contacts', 'insert', { notes: { nested: true } }, undefined)) throw new Error('nested mutation accepted');
  if (!validateMutation('contacts', 'insert', { notes: 'x'.repeat(5001) }, undefined)) throw new Error('oversized mutation accepted');
});

Deno.test('identifier validation rejects PostgREST injection syntax', () => {
  if (!validIdentifier('company_id')) throw new Error('valid identifier rejected');
  for (const value of ['id,secret', 'id.eq.1', 'x)', '', 1]) {
    if (validIdentifier(value)) throw new Error(`invalid identifier accepted: ${String(value)}`);
  }
});

Deno.test('sync result contract rejects false success and malformed identifiers', () => {
  const valid = parseSyncResult({ synced: true, interaction_id: 'i-1', contact_id: 'c-1', company_id: null });
  if (valid.interaction_id !== 'i-1') throw new Error('valid sync result rejected');
  for (const value of [{}, [], { synced: false, reason: 'contact_not_found' }, { synced: true, contact_id: 'c' }]) {
    try { parseSyncResult(value); throw new Error('invalid sync result accepted'); } catch (error) {
      if (error instanceof Error && error.message === 'invalid sync result accepted') throw error;
    }
  }
});

Deno.test('extracts a bounded stable identity from a 360 lookup', () => {
  if (extractContact360Id({ contact: { id: 'external-1' } }) !== 'external-1') {
    throw new Error('valid contact identity rejected');
  }
  for (const value of [null, {}, { contact: null }, { contact: { id: '' } }, { contact: { id: 'x'.repeat(201) } }]) {
    if (extractContact360Id(value) !== null) throw new Error('invalid contact identity accepted');
  }
});
