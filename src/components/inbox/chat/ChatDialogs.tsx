import { Suspense, lazy } from 'react';
import { log } from '@/lib/logger';
import { toast } from '@/hooks/ui/use-toast';
import { Conversation, Message, InteractiveMessage, InteractiveButton, LocationMessage } from '@/types/chat';
import { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { ExternalProductCatalog } from '@/components/catalog/ExternalProductCatalog';

const TransferDialog = lazy(() => import('../TransferDialog').then(m => ({ default: m.TransferDialog })));
const ScheduleMessageDialog = lazy(() => import('../ScheduleMessageDialog').then(m => ({ default: m.ScheduleMessageDialog })));
const CallDialog = lazy(() => import('@/components/calls/CallDialog').then(m => ({ default: m.CallDialog })));
const GlobalSearch = lazy(() => import('../GlobalSearch').then(m => ({ default: m.GlobalSearch })));
const InteractiveMessageBuilder = lazy(() => import('../InteractiveMessageBuilder').then(m => ({ default: m.InteractiveMessageBuilder })));
const ForwardMessageDialog = lazy(() => import('../ForwardMessageDialog').then(m => ({ default: m.ForwardMessageDialog })));
const LocationPicker = lazy(() => import('../LocationPicker').then(m => ({ default: m.LocationPicker })));
const CloseConversationDialog = lazy(() => import('../CloseConversationDialog').then(m => ({ default: m.CloseConversationDialog })));
const RealtimeTranscription = lazy(() => import('../RealtimeTranscription').then(m => ({ default: m.RealtimeTranscription })));

type DialogKey = 'quickReplies' | 'slashCommands' | 'transferDialog' | 'scheduleDialog' |
  'callDialog' | 'globalSearch' | 'chatSearch' | 'interactiveBuilder' | 'forwardDialog' |
  'locationPicker' | 'aiAssistant' | 'catalogDirect' | 'whisper' | 'templatesWithVars' |
  'realtimeTranscription' | 'closeDialog';

type DialogState = Record<DialogKey, boolean>;

interface ChatDialogsProps {
  dialogs: DialogState;
  openDialog: (key: DialogKey) => void;
  closeDialog: (key: DialogKey) => void;
  conversation: Conversation;
  forwardMessage: Message | null;
  callDirection: 'inbound' | 'outbound';
  contactId: string;
  onTransfer: (type: 'agent' | 'queue', targetId: string, message?: string) => void;
  onScheduleMessage: (message: string, scheduledAt: Date, attachment?: File) => Promise<void>;
  onSendInteractiveMessage: (interactive: InteractiveMessage) => void;
  onForwardToTargets: (targetIds: string[], targetType: 'contact' | 'group') => void;
  onSendLocation: (location: LocationMessage) => void;
  onSendProduct: (product: ExternalProduct) => void;
  onSetInputValue: (value: string | ((prev: string) => string)) => void;
}

export function ChatDialogs({
  dialogs, openDialog, closeDialog, conversation, forwardMessage, callDirection,
  contactId, onTransfer, onScheduleMessage, onSendInteractiveMessage,
  onForwardToTargets, onSendLocation, onSendProduct, onSetInputValue,
}: ChatDialogsProps) {
  return (
    <>
      <Suspense fallback={null}>
        {dialogs.transferDialog && <TransferDialog open={dialogs.transferDialog} onOpenChange={(v) => v ? openDialog('transferDialog') : closeDialog('transferDialog')} onTransfer={onTransfer as (type: "agent" | "connection" | "queue", targetId: string, message?: string) => void} />}
        {dialogs.scheduleDialog && <ScheduleMessageDialog open={dialogs.scheduleDialog} onOpenChange={(v) => v ? openDialog('scheduleDialog') : closeDialog('scheduleDialog')} onSchedule={onScheduleMessage} />}
        {dialogs.callDialog && <CallDialog open={dialogs.callDialog} onOpenChange={(v) => v ? openDialog('callDialog') : closeDialog('callDialog')} contact={{ name: conversation.contact.name, phone: conversation.contact.phone, avatar: conversation.contact.avatar }} direction={callDirection} onEnd={() => closeDialog('callDialog')} />}
        {dialogs.globalSearch && <GlobalSearch open={dialogs.globalSearch} onOpenChange={(v) => v ? openDialog('globalSearch') : closeDialog('globalSearch')} onSelectResult={(result) => { log.debug('Selected:', result); toast({ title: 'Resultado selecionado', description: result.title }); }} />}
        {dialogs.interactiveBuilder && <InteractiveMessageBuilder open={dialogs.interactiveBuilder} onOpenChange={(v) => v ? openDialog('interactiveBuilder') : closeDialog('interactiveBuilder')} onSend={onSendInteractiveMessage} />}
        {dialogs.forwardDialog && <ForwardMessageDialog open={dialogs.forwardDialog} onOpenChange={(v) => v ? openDialog('forwardDialog') : closeDialog('forwardDialog')} message={forwardMessage} onForward={onForwardToTargets} />}
        {dialogs.locationPicker && <LocationPicker open={dialogs.locationPicker} onOpenChange={(v) => v ? openDialog('locationPicker') : closeDialog('locationPicker')} onSend={onSendLocation} />}
        {dialogs.closeDialog && <CloseConversationDialog open={dialogs.closeDialog} onOpenChange={(v) => v ? openDialog('closeDialog') : closeDialog('closeDialog')} contactId={contactId} />}
      </Suspense>

      {dialogs.catalogDirect && <ExternalProductCatalog onSendProduct={onSendProduct} open={dialogs.catalogDirect} onOpenChange={(v) => v ? openDialog('catalogDirect') : closeDialog('catalogDirect')} />}

      {dialogs.realtimeTranscription && (
        <Suspense fallback={null}>
          <div className="px-3 mb-2">
            <RealtimeTranscription onTranscript={(text, isFinal) => { if (isFinal) onSetInputValue((prev: string) => prev + ' ' + text); }} onStatusChange={() => {}} className="w-full" />
          </div>
        </Suspense>
      )}
    </>
  );
}
