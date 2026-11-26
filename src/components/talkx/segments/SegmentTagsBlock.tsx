// X157 — bloco "Tags mais usadas no público" do painel de detalhes do segmento.
// Consome `useTalkXSegmentTags` (RPC `talkx_segment_tags`); o componente não fala
// com o banco (regra do lint: só hook importa o client).
import { RefreshCw } from 'lucide-react';
import { useTalkXSegmentTags } from '@/hooks/integrations/useTalkXSegmentTags';
import { fmtInt } from '../talkxShared';

interface Props {
  segmentId: string;
}

/**
 * As tags vêm dos contatos que **já receberam** campanha deste segmento — por
 * isso a lista fica vazia antes do primeiro envio. O texto do estado vazio diz
 * isso em vez de deixar o operador achando que a tela quebrou.
 */
export function SegmentTagsBlock({ segmentId }: Props) {
  const { tags, isLoading, isError, refetch } = useTalkXSegmentTags(segmentId);

  return (
    <div>
      <p className="text-xs font-semibold text-foreground mb-1">Tags mais usadas no público</p>
      {isLoading ? (
        <div className="space-y-1" aria-busy="true" aria-label="Carregando tags do público">
          <div className="h-5 w-24 rounded bg-muted/40 animate-pulse" />
          <div className="h-5 w-32 rounded bg-muted/40 animate-pulse" />
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2">
          <p className="text-2xs text-muted-foreground">Não foi possível carregar as tags.</p>
          <button
            type="button"
            onClick={refetch}
            className="text-2xs text-primary inline-flex items-center gap-1 hover:underline"
          >
            <RefreshCw className="w-3 h-3" /> Tentar de novo
          </button>
        </div>
      ) : !tags || tags.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          Nenhuma tag nos contatos deste público ainda. As tags aparecem depois do primeiro envio.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <li
              key={t.tag}
              className="inline-flex items-center gap-1 text-3xs px-1.5 py-0.5 rounded bg-muted/50 border border-border/60 text-muted-foreground max-w-full"
              title={`${t.tag}: ${fmtInt(t.count)} contato${t.count === 1 ? '' : 's'}`}
            >
              <span className="truncate max-w-[120px]">{t.tag}</span>
              <span className="font-semibold text-foreground-secondary">{fmtInt(t.count)}</span>
              <span className="sr-only">contato{t.count === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}