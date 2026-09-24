import { useIsMobile } from '@/hooks/ui/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ContactDetails } from './ContactDetails';
import type { Conversation } from '@/types/chat';

interface Props {
  conversation: Conversation;
  onClose: () => void;
}

/**
 * Renders ContactDetails as a side panel on desktop
 * and as a bottom Sheet on mobile.
 */
export function ContactDetailsResponsive({ conversation, onClose }: Props) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent side="bottom" className="max-h-[85vh] p-0 rounded-t-2xl">
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
