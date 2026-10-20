import { CONTACT_TYPES, type ContactType } from '@/utils/whatsappFileTypes';
import { CONTACT_TYPE_CONFIG, type TypeConfig } from './contactTypeConfig';

/** Configs na ordem canônica de `CONTACT_TYPES`. */
export const ORDERED_CONTACT_TYPE_CONFIGS: ReadonlyArray<TypeConfig & { type: ContactType }> =
  CONTACT_TYPES.map(t => ({ type: t.value, ...CONTACT_TYPE_CONFIG[t.value] }));

/** Valores aceitos como aba/filtro de tipo: `'all'` + os tipos canônicos. */
export const VALID_TAB_TYPES: ReadonlySet<string> = new Set(['all', ...CONTACT_TYPES.map(t => t.value)]);
