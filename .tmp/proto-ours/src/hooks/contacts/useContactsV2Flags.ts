import { useFeatureFlag } from '@/hooks/system/useFeatureFlag';

/**
 * CT-005 — chave `contacts.v2`: a experiência nova do módulo Contatos é liberada
 * por partes e recolhida sem esperar uma versão nova do sistema.
 *
 * A chave usa a infraestrutura de flags que o projeto já tem (tabela
 * `feature_flags`, lida por `useFeatureFlag`): nenhuma dependência nova, uma
 * única consulta compartilhada entre todos os consumidores e revalidação a cada
 * 5 minutos (sessão longa recebe a mudança sem recarregar a página).
 *
 * - `contacts.v2` (chave geral) é o desligamento geral: desligada, toda área
 *   volta ao comportamento atual, mesmo que a sub-chave da área esteja ligada.
 * - `contacts.v2.<área>` libera a área sozinha — uma não arrasta a outra.
 * - Sem linha na tabela (ou com a consulta falhando), o padrão é ligada em
 *   desenvolvimento/teste e desligada em produção: a experiência nova não
 *   chega ao cliente por acidente.
 *
 * As telas v2 ainda não existem (chegam a partir de CT-006); enquanto elas não
 * existem, o valor lido aqui não troca nenhuma peça da tela.
 */

/** Chave geral: desligada, TODAS as áreas voltam ao comportamento atual. */
export const CONTACTS_V2_MASTER_KEY = 'contacts.v2';

/** Áreas do módulo com liberação independente. */
export const CONTACTS_V2_AREAS = ['toolbar', 'cards', 'detalhe', 'empresa', 'edicao', 'protecao'] as const;

export type ContactsV2Area = (typeof CONTACTS_V2_AREAS)[number];

export type ContactsV2Flags = Record<ContactsV2Area, boolean>;

/**
 * Nome da sub-chave de uma área, do jeito que ele vai na coluna `key` de
 * `feature_flags` (o CHECK da tabela aceita `[a-z0-9_.-]`).
 */
export function contactsV2AreaKey(area: ContactsV2Area): string {
  return `${CONTACTS_V2_MASTER_KEY}.${area}`;
}

/**
 * Padrão da chave onde ainda não existe linha em `feature_flags`: ligada em
 * desenvolvimento/teste, desligada em produção.
 */
export function contactsV2FlagFallback(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === 'test';
}

/**
 * Áreas ligadas, na ordem canônica — é o que o módulo publica no elemento raiz
 * (`data-contacts-v2`), para a liberação por partes ser conferida sem abrir o
 * banco. Lista vazia = nenhuma área ligada = tela atual.
 */
export function contactsV2AreasLigadas(flags: ContactsV2Flags): ContactsV2Area[] {
  return CONTACTS_V2_AREAS.filter((area) => flags[area]);
}

/**
 * Estado das áreas do módulo Contatos.
 *
 * Uma sub-chave só vale ligada com a chave geral ligada (o desligamento é
 * imediato), e cada área responde por si: desligar `cards` não mexe em
 * `toolbar`, `detalhe`, `empresa`, `edicao` nem `protecao`.
 */
export function useContactsV2Flags(): ContactsV2Flags {
  const fallback = contactsV2FlagFallback();
  const master = useFeatureFlag(CONTACTS_V2_MASTER_KEY, fallback);
  // Cada sub-chave é lida sempre (nada de leitura condicional): a ordem das
  // chamadas não muda quando a chave geral está desligada.
  const toolbar = useFeatureFlag(contactsV2AreaKey('toolbar'), fallback);
  const cards = useFeatureFlag(contactsV2AreaKey('cards'), fallback);
  const detalhe = useFeatureFlag(contactsV2AreaKey('detalhe'), fallback);
  const empresa = useFeatureFlag(contactsV2AreaKey('empresa'), fallback);
  const edicao = useFeatureFlag(contactsV2AreaKey('edicao'), fallback);
  const protecao = useFeatureFlag(contactsV2AreaKey('protecao'), fallback);
  return {
    toolbar: master && toolbar,
    cards: master && cards,
    detalhe: master && detalhe,
    empresa: master && empresa,
    edicao: master && edicao,
    protecao: master && protecao,
  };
}
