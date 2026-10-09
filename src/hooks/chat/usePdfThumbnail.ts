/**
 * M01 — Miniatura da 1ª página de PDF num tile da aba Arquivos.
 *
 * A conta pesada (baixar, interpretar e desenhar a página 1) mora em `@/lib/pdfThumbnail`;
 * aqui ficam só o ciclo de vida e o estado do React:
 *
 * - a URL do objeto é lida por `useResolvedStorageUrl` (bucket privado exige URL assinada;
 *   o mesmo hook já renova a assinatura quando ela vence — R2-INB-059);
 * - cada Blob vira um object URL, REVOGADO quando o próximo resultado entra em cena (o `<img>`
 *   antigo continua válido até lá, sem piscar) e também no desmonte;
 * - `AbortSignal` é abortado no desmonte, então a renderização em voo para de verdade;
 * - resposta que chega depois do desmonte é descartada sem tocar em estado nem criar object URL;
 * - o estado exibido é DERIVADO (nada de `setState` no corpo do efeito): a assinatura da URL e o
 *   resultado daquele mesmo `urlAssinada` decidem o que o tile mostra.
 *
 * Estados devolvidos:
 * - `loading`    — assinatura da URL em andamento ou miniatura sendo gerada;
 * - `ready`      — `url` tem o object URL do Blob pronto para o `<img>`;
 * - `sem-previa` — não há prévia possível: item que não é PDF, `habilitado` falso, item sem URL,
 *                  PDF protegido por senha/corrompido/lento/grande demais, sem CORS ou falha de
 *                  rede. Mostra o ícone do arquivo;
 * - `erro`       — reservado à falha ao ASSINAR a URL do objeto (permissão/expiração): é o único
 *                  caminho em que o problema não é o PDF em si. Falha de renderização não vira
 *                  `erro`, vira `sem-previa`.
 */

import { useEffect, useRef, useState } from 'react';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import { renderPdfThumbnail } from '@/lib/pdfThumbnail';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

export type PdfThumbnailEstado = 'loading' | 'ready' | 'sem-previa' | 'erro';

export interface PdfThumbnailResultado {
  /** Object URL do Blob da miniatura; `null` fora do estado `ready`. */
  url: string | null;
  estado: PdfThumbnailEstado;
}

/** Largura do canvas da miniatura (o cartão maior tem 320 px de largura). */
export const PDF_THUMBNAIL_LARGURA = 320;

/** Resultado guardado para uma URL assinada: `url` nulo = PDF sem prévia. */
interface MiniaturasRenderizadas {
  /** URL assinada que originou o resultado — a identidade dele. */
  origem: string;
  url: string | null;
}

/** O item é um PDF? A extensão vem do `media_filename` ou do caminho do objeto; o MIME é a segunda via. */
function ehArquivoPdf(item: ContactMediaItem | null | undefined): boolean {
  if (!item) return false;
  if ((item.extension ?? '').toLowerCase() === 'pdf') return true;
  return (item.mimetype ?? '').toLowerCase() === 'application/pdf';
}

/**
 * Miniatura da 1ª página do PDF de um item da aba Arquivos.
 *
 * `habilitado` é o portão do chamador (normalmente "o tile entrou na zona de pré-carregamento"):
 * enquanto for falso, NADA é assinado nem renderizado — a aba monta um tile por arquivo.
 */
export function usePdfThumbnail(
  item: ContactMediaItem | null | undefined,
  habilitado: boolean,
): PdfThumbnailResultado {
  const ativo = Boolean(habilitado && ehArquivoPdf(item) && item?.url);

  // Sem `ativo` o locator vai vazio de propósito: o resolver não assina um objeto que ninguém
  // vai mostrar. Quando o item muda, a identidade do estado muda junto (o hook compara source).
  const { url: urlAssinada, isLoading, error } = useResolvedStorageUrl(
    ativo ? (item?.url ?? '') : '',
    undefined,
    { signedUrl: item?.signedUrl, signedUrlExpiresAt: item?.expiresAt },
  );

  const [resultado, setResultado] = useState<MiniaturasRenderizadas | null>(null);
  const urlObjetoRef = useRef<string | null>(null);

  const daOrigemAtual = Boolean(resultado && urlAssinada && resultado.origem === urlAssinada);
  const estado: PdfThumbnailEstado = !ativo
    ? 'sem-previa'
    : error
      ? 'erro'
      : !urlAssinada || isLoading
        ? 'loading'
        : daOrigemAtual
          ? (resultado?.url ? 'ready' : 'sem-previa')
          : 'loading';

  // Desmonte: o último object URL criado morre com o tile.
  useEffect(() => () => {
    if (urlObjetoRef.current) URL.revokeObjectURL(urlObjetoRef.current);
    urlObjetoRef.current = null;
  }, []);

  useEffect(() => {
    if (!ativo || error || isLoading || !urlAssinada) return;

    const controlador = new AbortController();
    let vivo = true;

    const guardar = (blob: Blob | null) => {
      // A guarda vem ANTES de `createObjectURL`: resposta de um efeito já desmontado não pode
      // criar object URL nenhum (seria um object URL sem dono, que ninguém revogaria).
      if (!vivo) return;
      const anterior = urlObjetoRef.current;
      const novo = blob ? URL.createObjectURL(blob) : null;
      urlObjetoRef.current = novo;
      setResultado({ origem: urlAssinada, url: novo });
      // O object URL antigo só sai depois que o novo entrou: o `<img>` em tela nunca fica quebrado.
      if (anterior && anterior !== novo) URL.revokeObjectURL(anterior);
    };

    void renderPdfThumbnail(urlAssinada, {
      largura: PDF_THUMBNAIL_LARGURA,
      sinal: controlador.signal,
      // Chave estável: a URL assinada troca de token a cada renovação e não pode ser a chave.
      chave: item?.id,
    })
      .then(guardar)
      .catch(() => guardar(null));

    return () => {
      vivo = false;
      // Aborta a renderização em voo (fila, download, parse, canvas) e devolve a vaga da fila.
      controlador.abort();
    };
  }, [ativo, error, isLoading, urlAssinada, item?.id]);

  return { url: estado === 'ready' ? (resultado?.url ?? null) : null, estado };
}
