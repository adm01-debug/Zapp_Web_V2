import { useState } from 'react';
import { Download, Eye, Lock, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { resolveSenderIdentity, type SenderProfileMap } from '@/lib/fileSenderIdentity';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import { cardName, formatCardDate, typeSizeLine } from './fileDisplay';
import { FileThumb } from './FileThumb';
import { FileActionsMenu } from './FileActionsMenu';
import { AudioPlayButton } from './AudioPlayButton';
import { SenderAvatar } from './SenderAvatar';
import { FILE_ACTION_BUTTON, FILE_ACTION_BUTTON_DISABLED } from './fileActionButton';

interface FileCardProps {
  item: ContactMediaItem;
  contactName: string;
  selected: boolean;
  /** Etapa 20: no modo seleção o cartão alterna a seleção em vez de abrir detalhes/prévia. */
  selectionMode?: boolean;
  selectionChecked?: boolean;
  /** Etapa 18 / D03: nome do remetente só cabe em até 4 colunas; em 5 colunas fica só a foto. */
  effectiveColumns?: number;
  /**
   * R04 / D04: perfis dos atendentes resolvidos em LOTE uma única vez no `FilesTab`
   * (`useMediaSenderProfiles`) e repassados por props — o cartão nunca consulta por conta própria.
   */
  senderProfiles?: SenderProfileMap;
  /** R04 / D01: `profiles.id` do usuário logado — decide o rótulo "Você". */
  currentUserId?: string | null;
  /** R04 / D06: `useDownloadPermission` resolvido uma vez no `FilesTab` (baixar x cadeado). */
  downloadAllowed?: boolean;
  onSelect: () => void;
  onToggleSelection?: () => void;
  onPreview: () => void;
  onForward: () => void;
  onRequestDelete: (item: ContactMediaItem) => void;
}

export function FileCard({
  item,
  contactName,
  selected,
  selectionMode = false,
  selectionChecked = false,
  effectiveColumns = 4,
  senderProfiles,
  currentUserId = null,
  downloadAllowed = false,
  onSelect,
  onToggleSelection,
  onPreview,
  onForward,
  onRequestDelete,
}: FileCardProps) {
  const [baixando, setBaixando] = useState(false);
  // D03: em ≤ 4 colunas foto + nome; em 5 colunas só a foto (o nome fica na dica do avatar).
  const mostraNomeRemetente = effectiveColumns <= 4;
  // S28/S29/S30: as três linhas de texto saem só do `fileDisplay` (nome, tipo·tamanho, data) —
  // nenhum renderer formata por conta própria (etapas 22–25).
  const nome = cardName(item);
  const nomeCompleto = item.filename?.trim() || nome.text;
  const meta = typeSizeLine(item);
  const data = formatCardDate(item.created_at);
  // S31/D01: quem enviou — "Você", contato, o atendente do arquivo ou "Equipe" (sem `agent_id`).
  const remetente = resolveSenderIdentity({
    item,
    currentUserId,
    contact: { name: contactName },
    profiles: senderProfiles,
  });
  // A URL de leitura do download vem do mesmo resolver da miniatura (assinatura em lote como
  // semente); a permissão decide entre baixar e o cadeado.
  const { url: urlDownload } = useResolvedStorageUrl(item.url, undefined, {
    signedUrl: item.signedUrl,
    signedUrlExpiresAt: item.expiresAt,
  });

  const acao = selectionMode ? onToggleSelection : undefined;

  const handleDownload = async () => {
    if (!downloadAllowed) {
      // D06: bloqueado pela política de segurança — o motivo aparece antes de frustrar.
      toast.error('🔒 Download bloqueado por política de segurança', {
        description: 'O download de arquivos está desabilitado para proteção de dados. Solicite permissão ao administrador.',
      });
      return;
    }
    const origem = urlDownload || item.signedUrl || item.url;
    if (baixando || !origem) return;
    setBaixando(true);
    try {
      const response = await fetch(origem);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = item.filename || nome.text;
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
    <article
      data-testid={`files-item-${item.id}`}
      data-selected={selected || selectionChecked ? 'true' : 'false'}
      className={cn(
        'rounded-xl border bg-card overflow-hidden flex flex-col',
        selected || selectionChecked ? 'border-primary ring-2 ring-primary' : 'border-border',
      )}
    >
      <div className="relative">
        {selectionMode && (
          <span className="absolute left-2 top-2 z-10 rounded-md bg-background/80 p-0.5">
            <Checkbox
              checked={selectionChecked}
              aria-label={`Selecionar ${item.displayName}`}
              onCheckedChange={() => onToggleSelection?.()}
            />
          </span>
        )}

        {/* Etapa 26: a previa (imagem, video, audio ou documento) vive no FileThumb; etapa 17:
            object-contain no cartao para os prints de planilha continuarem legiveis. */}
        <button
          type="button"
          aria-label={`Visualizar ${item.displayName}`}
          className="block w-full aspect-[16/10] bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={acao ?? onPreview}
        >
          <FileThumb item={item} size="card" />
        </button>

        {/* R05 (S41–S42): play/pause do áudio DENTRO da miniatura, como o mockup — círculo azul
            (variante `thumb` do A01/A02), sem abrir a janela e sem marcar o cartão (D05), com um
            áudio por vez pelo store do A01. Ele fica IRMÃO do botão de prévia, não dentro dele:
            botão dentro de botão é violação séria de acessibilidade (axe `nested-interactive`),
            e `FileThumb` (que desenha a miniatura) não pode renderizar controle interativo por
            isso. A camada é `pointer-events-none`; só o círculo recebe o toque. */}
        {item.type === 'audio' && (
          <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="pointer-events-auto">
              <AudioPlayButton item={item} variant="thumb" />
            </span>
          </span>
        )}
      </div>

      {/* R04 (S28–S31): quatro linhas fixas — nome, tipo·tamanho, data e remetente — para a
          altura do cartão ser a mesma em 3, 4 e 5 colunas (S36). */}
      <div className="p-2.5 flex flex-col gap-1">
        <button
          type="button"
          title={nomeCompleto}
          onClick={acao ?? onSelect}
          className="rounded text-left text-[13px] font-semibold leading-tight truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {nome.text}
        </button>
        <p className="text-xs text-muted-foreground truncate">{meta}</p>
        <p className="text-xs text-muted-foreground truncate">{data}</p>
        <div className="flex min-w-0 items-center">
          <SenderAvatar
            name={remetente.name}
            avatarUrl={remetente.avatarUrl}
            colorKey={item.agentId ?? undefined}
            showName={mostraNomeRemetente}
          />
        </div>
      </div>

      {/* R04 (S32): olho, baixar (D06), encaminhar e ⋮ — sem "Copiar link" nem "Salvar na
          galeria" (D07). R05/S41: o play do áudio NÃO fica mais nesta linha — ele passou para
          dentro da miniatura (o mockup e a etapa S32 não listam play nas ações; dois controles
          para o mesmo áudio quebrariam o "um áudio por vez" do store). O "Encaminhar" continua o
          mesmo botão "em breve" das outras vistas (o plano habilita o encaminhamento na
          etapa do painel), agora vindo da classe compartilhada. */}
      <div className="mt-auto flex items-center justify-end gap-1 px-2 pb-2">
        <button
          type="button"
          aria-label="Visualizar"
          className={FILE_ACTION_BUTTON}
          onClick={onPreview}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label={downloadAllowed ? 'Baixar' : 'Baixar · bloqueado por política de segurança'}
          title={downloadAllowed ? 'Baixar' : 'Download bloqueado por política de segurança'}
          disabled={baixando}
          className={FILE_ACTION_BUTTON}
          onClick={() => { void handleDownload(); }}
        >
          {downloadAllowed ? <Download className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          aria-label="Encaminhar"
          title="Disponível em breve"
          disabled
          className={FILE_ACTION_BUTTON_DISABLED}
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <FileActionsMenu item={item} onRequestDelete={onRequestDelete} />
      </div>
    </article>
  );
}
