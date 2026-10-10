/**
 * N-135 — Ajuda do Talk X: "tópicos mais vistos" e contatos de suporte.
 *
 * Os mais vistos vêm da RPC `talkx_help_top_topics` (só `article_id` e contagens,
 * nunca o usuário); os contatos vêm de `talkx_settings` (`support_contact` e
 * `specialist_contact`, jsonb: canal|destino|horário, vazios por padrão). Cada artigo
 * aberto grava uma linha em `talkx_help_views` por `recordTalkXHelpView`.
 */
import { useQuery } from '@tanstack/react-query';

import { fromTable, supabase } from '@/lib/supabaseHelpers';

import { findHelpDoc, loadTalkXHelpDocs } from './help/talkxHelpIndex';
import { recordTalkXHelpView } from './help/recordTalkXHelpView';

export interface TalkXHelpTopTopic {
  article_id: string;
  views: number;
  unique_viewers: number;
}

export type TalkXHelpChannel = 'whatsapp' | 'chat_interno' | 'email';

export interface TalkXHelpContact {
  canal: TalkXHelpChannel;
  destino: string | null;
  horario: string | null;
}

const CHANNEL_LABEL: Record<TalkXHelpChannel, string> = {
  whatsapp: 'WhatsApp',
  chat_interno: 'Chat interno',
  email: 'E-mail',
};

const CONTACT_KEYS = ['support_contact', 'specialist_contact'] as const;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Lê o jsonb do contato. Vazio por padrão: sem canal válido
 * (whatsapp|chat_interno|email) ou sem destino, não há linha para mostrar.
 */
function toContact(value: unknown): TalkXHelpContact | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const canal = raw.canal;
  if (canal !== 'whatsapp' && canal !== 'chat_interno' && canal !== 'email') return null;
  const destino = text(raw.destino);
  if (!destino) return null;
  return { canal, destino, horario: text(raw.horario) };
}

async function fetchTopTopics(days: number): Promise<TalkXHelpTopTopic[]> {
  const rpc = supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: TalkXHelpTopTopic[] | null; error: { message: string } | null }>;
  const { data, error } = await rpc('talkx_help_top_topics', { p_days: days });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchContacts(): Promise<Record<string, TalkXHelpContact | null>> {
  const { data, error } = await fromTable('talkx_settings').select('key,value').in('key', [...CONTACT_KEYS]);
  if (error) throw new Error(error.message);
  const out: Record<string, TalkXHelpContact | null> = {};
  for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) out[row.key] = toContact(row.value);
  return out;
}

function ContactLine({ label, contact }: { label: string; contact: TalkXHelpContact | null | undefined }) {
  if (!contact) return null;
  const detalhe = [contact.destino, contact.horario].filter(Boolean).join(' · ');
  return (
    <li>
      <strong>
        {label} · {CHANNEL_LABEL[contact.canal]}:
      </strong>{' '}
      {detalhe}
    </li>
  );
}

export interface TalkXHelpProps {
  days?: number;
  onOpenArticle?: (articleId: string) => void;
}

export function TalkXHelp({ days = 30, onOpenArticle }: TalkXHelpProps) {
  const top = useQuery({ queryKey: ['talkx-help-top-topics', days], queryFn: () => fetchTopTopics(days) });
  const contacts = useQuery({ queryKey: ['talkx-help-contacts'], queryFn: fetchContacts });
  const docs = useQuery({ queryKey: ['talkx-help-docs'], queryFn: loadTalkXHelpDocs });

  const titleOf = (id: string) => (docs.data ? findHelpDoc(docs.data, id)?.title : undefined) ?? id;

  return (
    <section aria-label="Ajuda do Talk X">
      <h2>Mais vistos</h2>
      {top.isLoading ? <p>Carregando…</p> : null}
      {top.isError ? <p role="alert">Não foi possível carregar os mais vistos.</p> : null}
      {top.data && top.data.length === 0 ? <p>Ainda não há visualizações.</p> : null}
      {top.data && top.data.length > 0 ? (
        <ol>
          {top.data.map((t) => (
            <li key={t.article_id}>
              <button
                type="button"
                onClick={() => {
                  void recordTalkXHelpView(t.article_id);
                  onOpenArticle?.(t.article_id);
                }}
              >
                {titleOf(t.article_id)}
              </button>{' '}
              <span>{t.views} {t.views === 1 ? 'visualização' : 'visualizações'}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <h2>Fale com a gente</h2>
      <ul>
        <ContactLine label="Suporte" contact={contacts.data?.support_contact} />
        <ContactLine label="Especialista" contact={contacts.data?.specialist_contact} />
      </ul>
    </section>
  );
}

export default TalkXHelp;
