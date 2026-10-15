import { useIsMobile } from '@/hooks/ui/use-mobile';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ContactDetails } from './ContactDetails';
import type { Conversation } from '@/types/chat';

interface Props {
  conversation: Conversation;
  onClose: () => void;
}

/**
 * Renders ContactDetails as a side panel on desktop
 * and as a bottom Sheet on mobile.
 *
 * No celular o painel ocupa 100% da largura do sheet (`w-full` na raiz de
 * ContactDetails) e o sheet tem ALTURA DEFINIDA (`h-[85vh]`): com só
 * `max-h-[85vh]` a altura do conteúdo era automática, e o `h-full` da raiz não
 * resolvia — a área rolável (`overflow-y-auto`) ficava sem teto e a última
 * seção não rolava. Título e descrição ficam ocultos visualmente (sr-only) para
 * o Radix Dialog anunciar o painel a leitores de tela.
 */
export function ContactDetailsResponsive({ conversation, onClose }: Props) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent side="bottom" className="h-[85vh] p-0 rounded-t-2xl [&>button]:hidden">
          <SheetTitle className="sr-only">Detalhes do Contato</SheetTitle>
          <SheetDescription className="sr-only">Dados do contato e histórico da conversa.</SheetDescription>
          <ContactDetails conversation={conversation} onClose={onClose} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="h-full shrink-0 overflow-hidden">
      <ContactDetails conversation={conversation} onClose={onClose} />
    </div>
  );
}
