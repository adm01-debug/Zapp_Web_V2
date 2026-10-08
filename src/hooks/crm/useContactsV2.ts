import { useFeatureFlag } from '@/hooks/system/useFeatureFlag';

/**
 * MC-010 — flag do módulo de Contatos (`contacts.v2`), liberada por área.
 *
 * A leitura usa a infraestrutura de flags existente (tabela `feature_flags` +
 * `useFeatureFlag`): liberar uma área ou reverter tudo é escrita de admin no
 * banco, sem deploy.
 *
 * São duas camadas e as duas precisam estar ligadas:
 * - `contacts.v2`          chave-mestra — desligada, o módulo inteiro volta ao
 *                          comportamento atual de uma vez;
 * - `contacts.v2.<área>`   libera uma área por vez.
 *
 * Na dúvida — linha ausente na tabela, query carregando ou com erro — o valor é
 * `false` (comportamento atual): a flag nunca "pisca" ligada por falta de dado.
 *
 * As quatro áreas do plano: `toolbar` (busca, filtros, ordenação, presets e
 * alternador de visão), `cards` (cards, lista, tabela e agrupamentos),
 * `detail` (painel de detalhe do contato) e `form` (formulário/diálogos).
 *
 * As linhas (`contacts.v2` e `contacts.v2.<área>`) entram na trilha de
 * banco/admin; sem elas nada muda, que é o estado desejado até a onda ser
 * liberada.
 */
export const CONTACTS_V2_MASTER_KEY = 'contacts.v2';

/** Áreas liberáveis de forma independente (MC-010). */
export const CONTACTS_V2_AREAS = ['toolbar', 'cards', 'detail', 'form'] as const;

export type ContactsV2Area = (typeof CONTACTS_V2_AREAS)[number];

/**
 * Chave da área em `feature_flags`. O CHECK da tabela aceita ponto
 * (`^[a-z0-9][a-z0-9_.-]{0,63}$`, migration 20260905060000_feature_flags.sql).
 */
export function contactsV2AreaKey(area: ContactsV2Area): string {
  return `${CONTACTS_V2_MASTER_KEY}.${area}`;
}

/**
 * `true` somente com a chave-mestra E a área ligadas; em qualquer outro caso
 * (desligada, sem linha, carregando ou erro) a área segue no comportamento atual.
 */
export function useContactsV2(area: ContactsV2Area): boolean {
  const masterEnabled = useFeatureFlag(CONTACTS_V2_MASTER_KEY, false);
  const areaEnabled = useFeatureFlag(contactsV2AreaKey(area), false);
  return masterEnabled && areaEnabled;
}
