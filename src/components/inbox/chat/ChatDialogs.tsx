import { Suspense, lazy } from 'react';
import { Conversation, Message, InteractiveMessage, InteractiveButton, LocationMessage } from '@/types/chat';
import { ExternalProductCatalog } from '@/components/catalog/ExternalProductCatalog';
import type { ForwardCallback } from '@/hooks/chat/useForwardMessage';
import type { TransferTargetType } from '../TransferDialog';

const TransferDialog = lazy(() => import('../TransferDialog').then(m => ({ default: m.TransferDialog })));
const ScheduleMessageDialog = lazy(() => import('../ScheduleMessageDialog').then(m => ({ default: m.ScheduleMessageDialog })));
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
  contactId: string;
  onTransfer: (type: TransferTargetType, targetId: string, message?: string) => void | Promise<void>;
  onScheduleMessage: (message: string, scheduledAt: Date, attachment?: File) => Promise<void>;
  onSendInteractiveMessage: (interactive: InteractiveMessage) => Promise<void>;
  onForwardToTargets: ForwardCallback;
  onSendLocation: (location: LocationMessage) => Promise<void> | void;
  onSetInputValue: (value: string | ((prev: string) => string)) => void;
  /**
   * R2-INB-018: mesmo contrato de seleção/navegação da instância da Inbox. A
   * busca embutida no chat (Ctrl+K) abre o resultado na conversa dele — antes
   * só registrava log e mostrava "Resultado selecionado", sem trocar de conversa.
   * DL1: quando o resultado é uma mensagem, o id dela vai junto para o painel
   * realçar e rolar até a mensagem alvo.
   */
  onSelectConversation?: (contactId: string, messageId?: string) => void;
}

export function ChatDialogs({
  dialogs, openDialog, closeDialog, conversation, forwardMessage,
  contactId, onTransfer, onScheduleMessage, onSendInteractiveMessage,
  onForwardToTargets, onSendLocation, onSetInputValue,
  onSelectConversation,
}: ChatDialogsProps) {
  // CT-14 — mesmo caminho de envio do catálogo, com o contato da conversa aberta.
  const presetContact = {
    id: conversation.contact.id,
    name: conversation.contact.name,
    phone: conversation.contact.phone,
    avatar_url: conversation.contact.avatar ?? null,
  };
  return (
    <>
      <Suspense fallback={null}>
        {dialogs.transferDialog && <TransferDialog open={dialogs.transferDialog} onOpenChange={(v) => v ? openDialog('transferDialog') : closeDialog('transferDialog')} onTransfer={onTransfer} queueId={conversation.contact.queue_id ?? null} />}
        {dialogs.scheduleDialog && <ScheduleMessageDialog open={dialogs.scheduleDialog} onOpenChange={(v) => v ? openDialog('scheduleDialog') : closeDialog('scheduleDialog')} onSchedule={onScheduleMessage} />}
        {dialogs.globalSearch && (
          <GlobalSearch
            open={dialogs.globalSearch}
            onOpenChange={(v) => v ? openDialog('globalSearch') : closeDialog('globalSearch')}
            onSelectResult={(result) => {
              if (!result.contactId) return;
              // DL1: só mensagem/transcrição têm um alvo a realçar; contato/CRM
              // abrem a conversa sem alvo (contrato antigo preservado).
              const alvo = (result.type === 'message' || result.type === 'transcription') && result.id
                ? result.id
                : undefined;
              if (alvo) onSelectConversation?.(result.contactId, alvo);
              else onSelectConversation?.(result.contactId);
            }}
            onManageQuickReplies={() => openDialog('quickReplies')}
          />
        )}
        {dialogs.interactiveBuilder && <InteractiveMessageBuilder open={dialogs.interactiveBuilder} onOpenChange={(v) => v ? openDialog('interactiveBuilder') : closeDialog('interactiveBuilder')} onSend={onSendInteractiveMessage} />}
        {dialogs.forwardDialog && <ForwardMessageDialog open={dialogs.forwardDialog} onOpenChange={(v) => v ? openDialog('forwardDialog') : closeDialog('forwardDialog')} message={forwardMessage} onForward={onForwardToTargets} />}
        {dialogs.locationPicker && <LocationPicker open={dialogs.locationPicker} onOpenChange={(v) => v ? openDialog('locationPicker') : closeDialog('locationPicker')} onSend={onSendLocation} />}
        {dialogs.closeDialog && <CloseConversationDialog open={dialogs.closeDialog} onOpenChange={(v) => v ? openDialog('closeDialog') : closeDialog('closeDialog')} contactId={contactId} />}
      </Suspense>

      {dialogs.catalogDirect && <ExternalProductCatalog presetContact={presetContact} open={dialogs.catalogDirect} onOpenChange={(v) => v ? openDialog('catalogDirect') : closeDialog('catalogDirect')} />}

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
