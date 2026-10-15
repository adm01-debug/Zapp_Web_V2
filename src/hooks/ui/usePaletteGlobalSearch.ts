import { useCallback } from 'react';

import { supabase } from '@/integrations/supabase/client';

/** Um resultado da busca global da paleta, já no formato que a paleta consome. */
export interface PaletteSearchHit {
  id: string;
  tipo: 'contato' | 'conversa';
  titulo: string;
  descricao: string;
}

const LIMITE_POR_FONTE = 5;

/**
 * O filtro do PostgREST (`or=`, `ilike`) usa `%` e `,` como sintaxe: sem limpar o
 * termo, o que o usuário digita muda a CONSULTA em vez de ser o valor buscado.
 */
export function limparTermoBusca(termo: string): string {
  return termo.replace(/[%,()\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface LinhaContato {
  id: string;
  name?: string | null;
  surname?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface LinhaMensagem {
  id: string;
  content?: string | null;
  contacts?: LinhaContato | LinhaContato[] | null;
}

/** Nome exibível de um contato — usado como título do resultado na paleta. */
export function nomeDoContato(contato: LinhaContato | null | undefined): string {
  const nome = [contato?.name, contato?.surname].filter(Boolean).join(' ').trim();
  return nome || 'Contato';
}

/**
 * Contatos e conversas para a paleta de comandos (⌘K). Usa as MESMAS tabelas e os
 * mesmos filtros que a busca global da inbox (`components/inbox/useGlobalSearchData`),
 * num formato mínimo: a paleta é quem decide ícone, grupo e o que o clique faz.
 */
export function usePaletteGlobalSearch() {
  return useCallback(async (termo: string): Promise<PaletteSearchHit[]> => {
    const q = limparTermoBusca(termo);
    if (q.length < 2) return [];

    const [resContatos, resMensagens] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, name, surname, phone, email')
        .eq('is_lid_legacy', false)
        .or(`name.ilike.%${q}%,surname.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(LIMITE_POR_FONTE),
      supabase
        .from('messages')
        .select('id, content, contacts:contact_id (id, name, surname)')
        .ilike('content', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(LIMITE_POR_FONTE),
    ]);

    const hits: PaletteSearchHit[] = [];
    for (const contato of (resContatos.data ?? []) as unknown as LinhaContato[]) {
      hits.push({
        id: `contato-${contato.id}`,
        tipo: 'contato',
        titulo: nomeDoContato(contato),
        descricao: [contato.phone, contato.email].filter(Boolean).join(' · ') || 'Abrir Contatos',
      });
    }
    for (const mensagem of (resMensagens.data ?? []) as unknown as LinhaMensagem[]) {
      const vinculo = Array.isArray(mensagem.contacts) ? mensagem.contacts[0] : mensagem.contacts;
      hits.push({
        id: `conversa-${mensagem.id}`,
        tipo: 'conversa',
        titulo: nomeDoContato(vinculo ?? undefined),
        descricao: (mensagem.content ?? '').slice(0, 80) || 'Abrir a caixa de entrada',
      });
    }
    return hits;
  }, []);
}
