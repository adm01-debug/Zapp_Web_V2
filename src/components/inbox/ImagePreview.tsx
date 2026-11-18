import {
  forwardRef,
  useState,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDownloadPermission } from '@/hooks/system/useDownloadPermission';
import { toast } from 'sonner';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import { cfImagesSrcSet } from '@/lib/cfImages';

// Mesmo seletor do ToolPanel (o outro diálogo modal da inbox): usado para prender
// o Tab dentro do lightbox enquanto ele estiver aberto.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Distancia em pixels entre os dois primeiros dedos de um toque.
function distanciaEntreDedos(touches: ArrayLike<{ clientX: number; clientY: number }>) {
  const [t0, t1] = [touches[0], touches[1]];
  return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
}

interface ImagePreviewProps {
  src: string;
  alt?: string;
  onClose?: () => void;
}

export const ImagePreview = forwardRef<HTMLDivElement, ImagePreviewProps>(function ImagePreview(
  { src, alt = 'Image', onClose }: ImagePreviewProps,
  ref,
) {
  // Escala numerica em vez de booleano: o botao continua dando 1x/1.5x, e a pinca
  // de dois dedos passa a poder parar em qualquer ponto entre 1x e 3x.
  const [scale, setScale] = useState(1);
  const isZoomed = scale > 1;
  // Estado do gesto em curso: distancia entre os dedos quando ele comecou e a
  // escala daquele momento. 0 em distanciaInicial = nao ha pinca em curso.
  // A escala e calculada SEMPRE contra o inicio do gesto (absoluta), nunca
  // multiplicando a anterior: acumular faz o zoom derivar e nao voltar ao 1x.
  const distanciaInicial = useRef(0);
  const escalaInicial = useRef(1);
  const { canDownload } = useDownloadPermission();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Ao abrir, guarda quem tinha o foco (o balão da imagem) e joga o foco para o
  // diálogo — sem isso o leitor de tela continua "lendo" a conversa por baixo.
  // Ao fechar, devolve o foco ao balão: sem isso o foco cai no <body> e o usuário
  // de teclado perde a posição na lista de mensagens.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  // Esc e Tab tratados NO diálogo (não em listener de `window`): um Esc global
  // atravessava o lightbox e fechava também o painel/diálogo aberto por baixo
  // (ex.: MediaPreviewDialog). `stopPropagation` mantém o evento aqui dentro.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const node = dialogRef.current;
    if (!node) return;
    const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) {
      event.preventDefault();
      node.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || active === node) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || active === node) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleDownload = async () => {
    if (!canDownload) {
      toast.error('🔒 Download bloqueado por política de segurança', {
        description: 'O download de arquivos está desabilitado para proteção de dados. Solicite permissão ao administrador.',
      });
      return;
    }
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = alt || 'image';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Download iniciado!');
    } catch {
      toast.error('Erro ao baixar imagem');
    }
  };

  // Portal para document.body: ancestrais com transform (framer-motion whileHover/scale
  // nos bubbles) viram containing block de position:fixed e o lightbox renderiza
  // gigante dentro da própria mensagem em vez de cobrir a tela.
  return createPortal(
    <motion.div
      ref={(node: HTMLDivElement | null) => {
        dialogRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      role="dialog"
      aria-modal="true"
      aria-label={alt && alt !== 'Image' ? `Pré-visualização de imagem: ${alt}` : 'Pré-visualização de imagem'}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center focus:outline-none"
      onClick={onClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="secondary"
            size="icon"
            aria-label={isZoomed ? "Reduzir imagem" : "Ampliar imagem"}
            onClick={(e) => {
              e.stopPropagation();
              setScale(isZoomed ? 1 : 1.5);
            }}
          >
            {isZoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Baixar"
            className={!canDownload ? 'opacity-50 cursor-not-allowed' : ''}
            onClick={(e) => {
              e.stopPropagation();
              void handleDownload();
            }}
          >
            <Download className="w-4 h-4" />
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button variant="secondary" size="icon" aria-label="Fechar" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </motion.div>
      </div>

      {/* Image */}
      <motion.img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        // Pinca de dois dedos. Fica no proprio <motion.img> de proposito: criar um
        // container novo mudaria img.parentElement, que ImagePreviewSize.test.tsx:113
        // usa para achar o backdrop.
        onTouchStart={(e) => {
          if (e.touches.length !== 2) return;
          distanciaInicial.current = distanciaEntreDedos(e.touches);
          escalaInicial.current = scale;
        }}
        onTouchMove={(e) => {
          if (e.touches.length !== 2 || distanciaInicial.current === 0) return;
          const proporcao = distanciaEntreDedos(e.touches) / distanciaInicial.current;
          setScale(Math.min(Math.max(escalaInicial.current * proporcao, 1), 3));
        }}
        onTouchEnd={() => {
          distanciaInicial.current = 0;
        }}
        drag={isZoomed}
        dragConstraints={dialogRef}
        dragElastic={0.1}
        animate={{ scale }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="max-w-[58.5vw] max-h-[55.25vh] object-contain rounded-lg shadow-2xl cursor-zoom-in"
        // touchAction so sai de 'auto' quando ha zoom: fora disso a pagina tem de
        // continuar rolando normalmente sob a imagem.
        style={{ cursor: isZoomed ? 'zoom-out' : 'zoom-in', touchAction: isZoomed ? 'none' : undefined }}
      />
    </motion.div>,
    document.body,
  );
});

interface MessageImageProps {
  src: string;
  alt?: string;
}

export function MessageImage({ src, alt = 'Image' }: MessageImageProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const { url: resolvedUrl, isLoading, error, refresh } = useResolvedStorageUrl(src);

  return (
    <>
      {/* Botão de verdade (não um `div` clicável): abre o lightbox pelo teclado e
          é ele que recupera o foco quando o diálogo fecha (foco volta ao balão). */}
      <button
        type="button"
        aria-label={alt && alt !== 'Image' ? `Expandir imagem: ${alt}` : 'Expandir imagem'}
        onClick={() => setShowPreview(true)}
        className="relative inline-block cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="relative cursor-pointer overflow-hidden rounded-lg"
        >
          {(!isLoaded || isLoading) && (
            <div className="absolute inset-0 bg-muted motion-safe:animate-pulse rounded-lg" />
          )}
          {resolvedUrl && (
            <motion.img
              key={resolvedUrl}
              src={resolvedUrl}
              srcSet={cfImagesSrcSet(resolvedUrl) ?? undefined}
              sizes="(max-width: 768px) 90vw, 280px"
              alt={alt}
              onLoad={() => setIsLoaded(true)}
              onError={() => { setIsLoaded(false); void refresh(); }}
              initial={{ opacity: 0 }}
              animate={{ opacity: isLoaded ? 1 : 0 }}
              className="max-w-[280px] max-h-[200px] object-cover rounded-lg"
            />
          )}
          {error && !isLoading && (
            <span className="block px-3 py-2 text-xs text-destructive">Mídia indisponível</span>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
            <span className="text-primary-foreground text-xs font-medium">Clique para expandir</span>
          </div>
        </motion.div>
      </button>

      <AnimatePresence>
        {showPreview && (
          <ImagePreview src={resolvedUrl || src} alt={alt} onClose={() => setShowPreview(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
