import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('protecao-contatos');

/**
 * Política de proteção de contatos (CT-091, tabela `contact_protection_policy`).
 *
 * A migration que criou a tabela diz o objetivo: "a protecao de contatos (bloquear copia,
 * bloquear impressao, marca d'agua, mascarar contato, limite de fichas por hora) deixa de ser
 * decisao do navegador e passa a ser regra do sistema, vinda do banco". A tabela tem a linha
 * global (escopo `NULL`, tudo ligado) e a RPC `get_my_protection_policy` resolve o efeito por
 * papel — mas nenhuma das duas era consumida pelo front. Aqui vive o contrato de leitura e
 * escrita; a RPC é a única leitura permitida aos papéis não-admin (a tabela crua exige admin).
 */

export type ContactProtectionScope = 'admin' | 'supervisor' | 'agent';

/** Ordem do enum `public.app_role` (admin é o de maior privilégio). */
export const CONTACT_PROTECTION_SCOPES: ContactProtectionScope[] = [
  'admin',
  'supervisor',
  'agent',
];

export const CONTACT_PROTECTION_SCOPE_LABELS: Record<ContactProtectionScope, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  agent: 'Agente',
};

export const CONTACT_PROTECTION_GLOBAL_LABEL = 'Padrão do sistema (todos os papéis)';

export interface ContactProtectionValues {
  bloquearCopia: boolean;
  bloquearImpressao: boolean;
  marcaDagua: boolean;
  mascararContato: boolean;
  limiteFichasHora: number;
}

/** Mesmos valores que a migration semeia na linha global e que a RPC usa como rede de segurança. */
export const CONTACT_PROTECTION_DEFAULTS: ContactProtectionValues = Object.freeze({
  bloquearCopia: true,
  bloquearImpressao: true,
  marcaDagua: true,
  mascararContato: true,
  limiteFichasHora: 100,
});

export interface ContactProtectionField {
  chave: keyof ContactProtectionValues;
  rotulo: string;
  ajuda: string;
}

export const CONTACT_PROTECTION_FIELDS: ContactProtectionField[] = [
  {
    chave: 'mascararContato',
    rotulo: 'Mascarar contato',
    ajuda: 'Telefone e e-mail aparecem parcialmente ocultos nas telas de contato.',
  },
  {
    chave: 'bloquearCopia',
    rotulo: 'Bloquear cópia',
    ajuda: 'Impede copiar o conteúdo marcado como dado de contato.',
  },
  {
    chave: 'bloquearImpressao',
    rotulo: 'Bloquear impressão',
    ajuda: 'Impede imprimir (e salvar em PDF) enquanto a política estiver ativa.',
  },
  {
    chave: 'marcaDagua',
    rotulo: "Marca d'água",
    ajuda: 'Sobreposição discreta com o identificador de quem está vendo a tela.',
  },
];

export type ContactProtectionOrigin = 'papel' | 'global' | 'padrao';

export const CONTACT_PROTECTION_ORIGIN_LABELS: Record<ContactProtectionOrigin, string> = {
  papel: 'regra do seu papel',
  global: 'padrão do sistema',
  padrao: 'padrão embutido (nenhuma linha no banco)',
};

export interface ContactProtectionPolicy extends ContactProtectionValues {
  id: string;
  scopeRole: ContactProtectionScope | null;
  updatedAt: string;
}

export interface MyContactProtectionPolicy extends ContactProtectionValues {
  origem: ContactProtectionOrigin;
}

const ORIGENS: ContactProtectionOrigin[] = ['papel', 'global', 'padrao'];

export function isProtectionOrigin(valor: string): valor is ContactProtectionOrigin {
  return (ORIGENS as string[]).includes(valor);
}

interface PolicyRow {
  id: string;
  scope_role: string | null;
  bloquear_copia: boolean;
  bloquear_impressao: boolean;
  marca_dagua: boolean;
  mascarar_contato: boolean;
  limite_fichas_hora: number;
  updated_at: string;
}

interface MyPolicyRow {
  bloquear_copia: boolean;
  bloquear_impressao: boolean;
  marca_dagua: boolean;
  mascarar_contato: boolean;
  limite_fichas_hora: number;
  origem: string;
}

const COLUNAS =
  'id, scope_role, bloquear_copia, bloquear_impressao, marca_dagua, mascarar_contato, limite_fichas_hora, updated_at';

export function mapPolicyRow(linha: PolicyRow): ContactProtectionPolicy {
  return {
    id: linha.id,
    scopeRole: (linha.scope_role as ContactProtectionScope | null) ?? null,
    bloquearCopia: linha.bloquear_copia,
    bloquearImpressao: linha.bloquear_impressao,
    marcaDagua: linha.marca_dagua,
    mascararContato: linha.mascarar_contato,
    limiteFichasHora: linha.limite_fichas_hora,
    updatedAt: linha.updated_at,
  };
}

/** Linhas configuradas, do escopo global para os papéis. Leitura restrita ao admin pela RLS. */
export async function fetchContactProtectionPolicies(): Promise<ContactProtectionPolicy[]> {
  const { data, error } = await supabase
    .from('contact_protection_policy')
    .select(COLUNAS)
    .order('scope_role', { ascending: true, nullsFirst: true })
    .limit(20);
  if (error) throw error;
  return ((data ?? []) as unknown as PolicyRow[]).map(mapPolicyRow);
}

/**
 * Política efetiva de quem está logado, resolvida no banco (papel > global > padrão). `origem`
 * diz de onde veio — é o que evita a tela mentir sobre qual regra está valendo.
 */
export async function fetchMyContactProtectionPolicy(): Promise<MyContactProtectionPolicy> {
  const { data, error } = await supabase.rpc('get_my_protection_policy');
  if (error) throw error;
  const linha = ((data ?? []) as unknown as MyPolicyRow[])[0];
  if (!linha) throw new Error('get_my_protection_policy não devolveu a política efetiva');
  if (!isProtectionOrigin(linha.origem)) {
    throw new Error(`get_my_protection_policy devolveu origem desconhecida: ${linha.origem}`);
  }
  return {
    bloquearCopia: linha.bloquear_copia,
    bloquearImpressao: linha.bloquear_impressao,
    marcaDagua: linha.marca_dagua,
    mascararContato: linha.mascarar_contato,
    limiteFichasHora: linha.limite_fichas_hora,
    origem: linha.origem,
  };
}

/**
 * Só os cinco valores da política. Uma linha do banco (ou a resposta da RPC) traz id, escopo e
 * data, que não são política — sem esta poda eles vazam para o estado do formulário.
 */
export function pickProtectionValues(fonte: ContactProtectionValues): ContactProtectionValues {
  return {
    bloquearCopia: fonte.bloquearCopia,
    bloquearImpressao: fonte.bloquearImpressao,
    marcaDagua: fonte.marcaDagua,
    mascararContato: fonte.mascararContato,
    limiteFichasHora: fonte.limiteFichasHora,
  };
}

function paraColunas(valores: ContactProtectionValues) {
  return {
    bloquear_copia: valores.bloquearCopia,
    bloquear_impressao: valores.bloquearImpressao,
    marca_dagua: valores.marcaDagua,
    mascarar_contato: valores.mascararContato,
    limite_fichas_hora: valores.limiteFichasHora,
  };
}

interface SaveParams {
  /** Linha existente; ausente = criar a regra do escopo. */
  id?: string | null;
  /** `null` = escopo global. */
  scopeRole: ContactProtectionScope | null;
  valores: ContactProtectionValues;
}

/**
 * Grava a regra do escopo. Criar e atualizar são explícitos (insert/update por id) em vez de
 * upsert: o índice único do escopo global é `NULLS NOT DISTINCT` e depende de o PostgREST
 * resolver conflito com `NULL`, que é o tipo de sutileza que não quero que decida uma escrita
 * silenciosa.
 */
export async function saveContactProtectionPolicy(
  params: SaveParams,
): Promise<ContactProtectionPolicy> {
  const colunas = paraColunas(params.valores);
  const consulta = params.id
    ? supabase.from('contact_protection_policy').update(colunas).eq('id', params.id)
    : supabase
        .from('contact_protection_policy')
        .insert({ ...colunas, scope_role: params.scopeRole });

  const { data, error } = await consulta.select(COLUNAS).single();
  if (error) throw error;
  return mapPolicyRow(data as unknown as PolicyRow);
}

/** Remove a exceção do papel — o escopo volta a cair no padrão do sistema. */
export async function deleteContactProtectionPolicy(id: string): Promise<string> {
  const { data, error } = await supabase
    .from('contact_protection_policy')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  const apagadas = (data ?? []) as Array<{ id: string }>;
  if (apagadas.length === 0) {
    throw new Error('nenhuma regra foi removida (você tem permissão de admin?)');
  }
  return id;
}

export const CONTACT_PROTECTION_QUERY_KEY = ['contact-protection-policies'] as const;
export const MY_CONTACT_PROTECTION_QUERY_KEY = ['my-contact-protection-policy'] as const;

export function useContactProtectionPolicies() {
  const query = useQuery({
    queryKey: CONTACT_PROTECTION_QUERY_KEY,
    queryFn: fetchContactProtectionPolicies,
    staleTime: 60_000,
  });
  return {
    policies: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: () => void query.refetch(),
  };
}

export function useMyContactProtectionPolicy() {
  const query = useQuery({
    queryKey: MY_CONTACT_PROTECTION_QUERY_KEY,
    queryFn: fetchMyContactProtectionPolicy,
    staleTime: 60_000,
  });
  return {
    policy: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useSaveContactProtectionPolicy() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: saveContactProtectionPolicy,
    onSuccess: (salva) => {
      void cliente.invalidateQueries({ queryKey: CONTACT_PROTECTION_QUERY_KEY });
      void cliente.invalidateQueries({ queryKey: MY_CONTACT_PROTECTION_QUERY_KEY });
      toast.success(
        salva.scopeRole
          ? `Regra de ${CONTACT_PROTECTION_SCOPE_LABELS[salva.scopeRole]} salva`
          : 'Padrão do sistema salvo',
      );
    },
    onError: (erro: unknown) => {
      log.error('falha ao salvar a política de proteção de contatos', { erro });
      toast.error('Não foi possível salvar a política de proteção');
    },
  });
}

export function useDeleteContactProtectionPolicy() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: deleteContactProtectionPolicy,
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: CONTACT_PROTECTION_QUERY_KEY });
      void cliente.invalidateQueries({ queryKey: MY_CONTACT_PROTECTION_QUERY_KEY });
      toast.success('Exceção removida — o papel volta ao padrão do sistema');
    },
    onError: (erro: unknown) => {
      log.error('falha ao remover a exceção de proteção de contato', { erro });
      toast.error('Não foi possível remover a exceção');
    },
  });
}
