import type { CommandItem } from '@/components/ui/command-palette-data';
import { ContactService } from '@/services/contact.service';
import { escapeLikeWildcards } from '@/lib/emailThreadQuery';
import { openContactChat } from '@/lib/openContactChat';

const CONTACT_LIMIT = 8;
const SOURCE_TIMEOUT_MS = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type CommandSearch = (query: string) => Promise<CommandItem[]>;
type CommandSearchSource = { kind: 'catalog' | 'contacts'; search: CommandSearch };

function contactSearchError(): CommandItem[] {
  return [{
    id: 'contact-search-error', title: 'Busca de contatos indisponível',
    description: 'Edite a busca para tentar novamente.', category: 'search', disabled: true,
  }];
}

/** Reutiliza a busca autorizada no servidor; não carrega toda a lista no cliente. */
export async function searchContactCommands(query: string): Promise<CommandItem[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  try {
    const { data, error } = await ContactService.searchContacts({
      search_term: escapeLikeWildcards(term), page_size: CONTACT_LIMIT, page_offset: 0,
      sort_field: 'name', sort_direction: 'asc',
    });
    if (error || (data !== null && !Array.isArray(data))) return contactSearchError();
    return (data ?? []).slice(0, CONTACT_LIMIT).map((contact): CommandItem => {
      if (!UUID.test(contact.id)) throw new Error('invalid-contact-id');
      const title = [contact.name, contact.surname].filter(Boolean).join(' ').trim() ||
        contact.nickname?.trim() || contact.phone || 'Contato sem nome';
      const description = [contact.phone || contact.email, contact.company].filter(Boolean).join(' · ');
      return {
        id: 'contact-' + contact.id, title, description, badge: 'Contato', category: 'search',
        action: () => openContactChat(contact.id),
      };
    });
  } catch {
    return contactSearchError();
  }
}

/** O prazo é da espera da paleta; não aborta nem repete a chamada de transporte. */
async function settleCommandSource(query: string, source: CommandSearchSource): Promise<CommandItem[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('command-search-timeout')), SOURCE_TIMEOUT_MS);
    });
    return await Promise.race([Promise.resolve().then(() => source.search(query)), deadline]);
  } catch {
    return source.kind === 'contacts' ? contactSearchError() : [];
  } finally {
    clearTimeout(timer);
  }
}

/** Falha ou pendência de uma fonte não retém a outra além do orçamento. */
export async function searchCommandSources(query: string, sources: readonly CommandSearchSource[]): Promise<CommandItem[]> {
  if (query.trim().length < 2) return [];
  const outcomes = await Promise.allSettled(sources.map((source) => settleCommandSource(query, source)));
  return outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? outcome.value : []);
}
