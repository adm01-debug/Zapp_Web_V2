import { describe, expect, it } from 'vitest';

import type { ContactManualPriority, Database } from '@/integrations/supabase/types';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

type Contacts = Database['public']['Tables']['contacts'];
type SetManualPriorityArgs = Database['public']['Functions']['set_manual_priority']['Args'];

type ManualPriorityVocabulary = Expect<
  Equal<ContactManualPriority, 'low' | 'medium' | 'high' | 'urgent'>
>;
type ContactRowUsesVocabulary = Expect<
  Equal<Contacts['Row']['manual_priority'], ContactManualPriority | null>
>;
type ContactInsertUsesVocabulary = Expect<
  Equal<Contacts['Insert']['manual_priority'], ContactManualPriority | null | undefined>
>;
type ContactUpdateUsesVocabulary = Expect<
  Equal<Contacts['Update']['manual_priority'], ContactManualPriority | null | undefined>
>;
type RpcAllowsClearWithNull = Expect<
  Equal<SetManualPriorityArgs['p_priority'], ContactManualPriority | null>
>;

const acceptedPriority: ContactManualPriority = 'urgent';
const clearManualPriority: SetManualPriorityArgs = {
  p_contact_id: '00000000-0000-0000-0000-000000000000',
  p_priority: null,
};

describe('tipos da prioridade manual', () => {
  it('limitam o vocabulario da prioridade manual e aceitam null na RPC para limpar', () => {
    expect(acceptedPriority).toBe('urgent');
    expect(clearManualPriority.p_priority).toBeNull();
  });
});
