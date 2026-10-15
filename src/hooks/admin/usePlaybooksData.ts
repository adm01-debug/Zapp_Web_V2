import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/**
 * Camada de dados dos playbooks (tabela `public.playbooks`, migration 20260409014536).
 *
 * Leitura: qualquer usuário `authenticated` vê todas as linhas — o RLS tem
 * `FOR SELECT USING (true)`. O recorte "só os ativos" é responsabilidade DESTA
 * camada (`is_active = true`), porque a policy não separa ativo de inativo.
 *
 * Escrita: só admin/supervisor (`is_admin_or_supervisor(auth.uid())`). Quando a
 * policy barra, o PostgREST **não devolve erro**: o UPDATE afeta 0 linhas e volta
 * `{ data: [], error: null }`. Tratar isso como sucesso seria dizer ao gerente que
 * o playbook mudou quando nada mudou — por isso `setPlaybookActive` confere as
 * linhas afetadas (`.select('id')`) e lança `PlaybookWriteError` quando vier zero.
 */

export interface PlaybookStep {
  order: number;
  title: string;
  description: string;
  tips: string;
}

export interface Playbook {
  id: string;
  name: string;
  description: string | null;
  category: string;
  steps: PlaybookStep[];
  is_active: boolean;
  created_at: string;
}

export const PLAYBOOK_COLUNAS = 'id, name, description, category, steps, is_active, created_at';

export class PlaybookWriteError extends Error {
  readonly motivo: 'permissao' | 'servidor';

  constructor(motivo: 'permissao' | 'servidor', mensagem: string) {
    super(mensagem);
    this.name = 'PlaybookWriteError';
    this.motivo = motivo;
  }
}

function normalizar(row: {
  id: string;
  name: string;
  description: string | null;
  category: string;
  steps: Json;
  is_active: boolean;
  created_at: string;
}): Playbook {
  return {
    ...row,
    steps: Array.isArray(row.steps) ? (row.steps as unknown as PlaybookStep[]) : [],
  };
}

/**
 * Lista completa (ativos e inativos) para o gerenciador. Ordem determinística:
 * categoria, nome e id — sem o desempate por `id` duas linhas de mesmo nome
 * trocam de lugar entre leituras.
 */
export async function fetchPlaybooks() {
  const { data, error } = await supabase
    .from('playbooks')
    .select(PLAYBOOK_COLUNAS)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
    .order('id', { ascending: true });
  if (error) return { data: null, error };
  return { data: (data ?? []).map(normalizar), error: null };
}

/**
 * Playbooks ATIVOS — o que o atendente pode consultar. `categoria` é opcional;
 * sem ela vêm todas as categorias.
 */
export async function fetchPlaybooksAtivos(categoria?: string) {
  let consulta = supabase.from('playbooks').select(PLAYBOOK_COLUNAS).eq('is_active', true);
  if (categoria) consulta = consulta.eq('category', categoria);
  const { data, error } = await consulta
    .order('category', { ascending: true })
    .order('name', { ascending: true })
    .order('id', { ascending: true });
  if (error) return { data: null, error };
  return { data: (data ?? []).map(normalizar), error: null };
}

/**
 * Liga/desliga um playbook. Lança quando o banco recusa ou quando nada foi
 * afetado — zero linhas aqui significa que o RLS filtrou a escrita (agente
 * comum) ou que o playbook não existe mais.
 */
export async function setPlaybookActive(id: string, ativo: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('playbooks')
    .update({ is_active: ativo })
    .eq('id', id)
    .select('id');

  if (error) {
    throw new PlaybookWriteError(
      'servidor',
      'Não foi possível alterar o playbook. Tente novamente.',
    );
  }
  if (!data || data.length === 0) {
    throw new PlaybookWriteError(
      'permissao',
      'Playbook não alterado — nenhuma linha mudou (permissão de admin/supervisor ou playbook removido).',
    );
  }
}
