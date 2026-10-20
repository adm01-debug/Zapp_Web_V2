import { useState } from 'react';
import { X, Image, File, Play, Share2, Lock, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { resolveSenderIdentity, type SenderProfileMap } from '@/lib/fileSenderIdentity';
import { TYPE_LABEL, formatFileDate, formatSize } from './fileDisplay';
import { SenderAvatar } from './SenderAvatar';

/**
 * Detalhes de um arquivo (etapa 31). O MESMO conteudo serve aos dois modos — lado a lado
 * (260 px, so com o contêiner >= 1100 px) e `Sheet` sobreposto a direita (abaixo disso).
 *
 * Nada aqui substitui o painel cadastral do contato: o `Sheet` e um overlay a direita e o
 * painel lado a lado entra na MESMA linha da area de arquivos, nunca no lugar do contato.
 * A exclusao foi retirada daqui (etapa 35): o botao so PEDE a exclusao (`onRequestDelete`),
 * quem apaga e o `useFilesActions.deleteMessage` centralizado no `FilesTab`.
 *
 * R07 (S49–S53): o painel ganhou a linha de quem enviou (`SenderAvatar`, foto + nome, D01),
 * a legenda, o download pela POLITICA (D06: permitido baixa, bloqueado = cadeado + motivo) e
 * o encaminhamento HABILITADO pelos MESMOS caminhos que o cartao ja usa — o `FilesTab`
 * resolve os perfis de quem enviou em lote (D04) e entrega o mesmo handler de encaminhamento
 * do cartao (S52). O painel nao consulta nada por conta propria.
 */

export interface FileDetailContentProps {
  item: ContactMediaItem;
  contactName: string;
  /** D04/R04: perfis resolvidos em lote no `FilesTab` (nunca uma consulta por painel). */
  senderProfiles?: SenderProfileMap;
  /** D01/R04: `profiles.id` do usuário logado — decide o rótulo "Você". */
  currentUserId?: string | null;
  /** D06/R04: `useDownloadPermission` resolvido uma vez no `FilesTab`. */
  downloadAllowed?: boolean;
  /** S52: o MESMO handler do cartão (`openForward([item])` do `FilesTab`). */
  onForward: (item: ContactMediaItem) => void;
  onClose: () => void;
  onRequestDelete: (item: ContactMediaItem) => void;
}

export function FileDetailContent({
  item,
  contactName,
  senderProfiles,
  currentUserId = null,
  downloadAllowed = false,
  onForward,
  onClose,
  onRequestDelete,
}: FileDetailContentProps) {
  // Etapa 10 + R2-INB-059: o locator vai SEMPRE para o resolver (a URL em lote entra como
  // semente), entao o `refresh` do erro consegue renovar a assinatura que falhou.
  const { url: resolvedUrl, refresh } = useResolvedStorageUrl(item.url, undefined, {
    signedUrl: item.signedUrl,
    signedUrlExpiresAt: item.expiresAt,
  });
  const displayUrl = resolvedUrl || item.signedUrl || '';
  // R2-INB-060: o erro pertence a URL que falhou, nao ao painel. O `FilesTab` troca o
  // arquivo selecionado na MESMA instancia deste componente (sem `key` por arquivo), entao
  // um `hasError` solto mantinha a imagem A em erro quando o usuario escolhia B — e a
  // renovacao bem-sucedida da URL tambem nao podia reapresentar a imagem.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const hasError = displayUrl !== '' && failedUrl === displayUrl;
  const [baixando, setBaixando] = useState(false);
  const size = formatSize(item.size);
  // Etapa 31: nome tecnico so quando agrega — quando difere do displayName legivel.
  const technicalName = item.filename && item.filename !== item.displayName ? item.filename : null;
  // S49/D01: a MESMA identidade de quem enviou que o cartao mostra — "Você", o contato, o
  // atendente do arquivo ou "Equipe" (sem `agent_id`). Sem foto, o `SenderAvatar` cai nas
  // iniciais com a cor estavel da pessoa (D02).
  const remetente = resolveSenderIdentity({
    item,
    currentUserId,
    contact: { name: contactName },
    profiles: senderProfiles,
  });

  // S51/D06: o download e o MESMO caminho do cartao (fetch + `<a download>`), e so acontece
  // com a permissao concedida — sem ela o botao e o cadeado com o motivo a vista.
  const handleDownload = async () => {
    if (!downloadAllowed) return;
    const origem = displayUrl || item.url;
    if (baixando || !origem) return;
    setBaixando(true);
    try {
      const response = await fetch(origem);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = item.filename || item.displayName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error('Erro ao baixar arquivo', {
        description: 'Não foi possível baixar o arquivo. Tente novamente.',
      });
    } finally {
      setBaixando(false);
    }
  };

  return (
    <div data-testid="file-detail-panel" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">Detalhes</p>
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* S49: a previa e a area MAIOR do painel — mais alta que a largura da coluna e com o
          arquivo inteiro a vista (`object-contain`, como a miniatura do cartao: print de
          planilha nao pode ser cortado). Sem tipo com previa, o icone grande ocupa o quadro. */}
      <div className="aspect-[4/5] rounded-lg bg-muted flex items-center justify-center overflow-hidden">
        {(item.type === 'image' || item.type === 'sticker') && !hasError && displayUrl ? (
          <img src={displayUrl} alt={item.displayName} className="w-full h-full object-contain" onError={() => { setFailedUrl(displayUrl); void refresh(); }} />
        ) : item.type === 'video' || item.type === 'audio' ? (
          <Play className="w-12 h-12 text-muted-foreground" />
        ) : item.type === 'document' ? (
          <File className="w-12 h-12 text-muted-foreground" />
        ) : (
          <Image className="w-12 h-12 text-muted-foreground" />
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold truncate" title={item.filename}>{item.displayName}</p>
        {technicalName && (
          <p className="text-2xs text-muted-foreground truncate" title={technicalName}>Nome do arquivo: {technicalName}</p>
        )}
        <p className="text-xs text-muted-foreground">{TYPE_LABEL[item.type]}</p>
        <p className="text-xs text-muted-foreground">{size ? `Tamanho: ${size}` : 'Tamanho: não informado'}</p>
        <p className="text-xs text-muted-foreground">Data: {formatFileDate(item.created_at)}</p>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Enviado por</span>
          <SenderAvatar
            name={remetente.name}
            avatarUrl={remetente.avatarUrl}
            colorKey={item.agentId ?? undefined}
            size="md"
            showName
          />
        </div>
      </div>

      {item.caption && <p className="text-xs bg-muted/40 rounded-lg p-2">{item.caption}</p>}

      {/* Etapa 19 + D07: sem "Copiar link" nem "Salvar na galeria". S51/D06: o download segue
          a política — com permissão o botão baixa; sem ela, o cadeado com o motivo a vista. */}
      <div className="flex flex-col gap-1.5">
        {downloadAllowed ? (
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={baixando}
            onClick={() => { void handleDownload(); }}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />Baixar arquivo
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled
            aria-disabled="true"
            title="Bloqueado pela política de segurança"
          >
            <Lock className="w-3.5 h-3.5 mr-1.5" />Baixar · bloqueado pela política
          </Button>
        )}
        {/* S52: o encaminhamento do painel usa o mesmo handler do cartão. */}
        <Button size="sm" variant="outline" className="h-9" onClick={() => onForward(item)}>
          <Share2 className="w-3.5 h-3.5 mr-1.5" />Encaminhar
        </Button>
        {item.sender === 'agent' && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-destructive hover:text-destructive"
            onClick={() => onRequestDelete(item)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />Excluir
          </Button>
        )}
      </div>
    </div>
  );
}

/** Casca lado a lado (260 px) — etapa 31: so renderizada com o contêiner >= 1100 px. */
export function FileDetailPanel(props: FileDetailContentProps) {
  return (
    <div data-testid="file-detail-panel-inline" className="w-[260px] shrink-0 rounded-xl border border-border bg-card p-3">
      <FileDetailContent {...props} />
    </div>
  );
}
