import { ContextualEmptyState } from './ContextualEmptyState';

export function InboxEmptyState(props: { onConnectWhatsApp?: () => void; onImportContacts?: () => void; onLearnMore?: () => void }) {
  return <ContextualEmptyState context="inbox" onPrimaryAction={props.onConnectWhatsApp} onSecondaryAction={props.onImportContacts} onTertiaryAction={props.onLearnMore} />;
}

export function ContactsEmptyState(props: { onAddContact?: () => void; onImportSpreadsheet?: () => void }) {
  return <ContextualEmptyState context="contacts" onPrimaryAction={props.onAddContact} onSecondaryAction={props.onImportSpreadsheet} />;
}

export function QueuesEmptyState(props: { onCreateQueue?: () => void; onUseWizard?: () => void }) {
  return <ContextualEmptyState context="queues" onPrimaryAction={props.onCreateQueue} onSecondaryAction={props.onUseWizard} />;
}

export function AgentsEmptyState(props: { onInviteAgent?: () => void; onConfigurePermissions?: () => void }) {
  return <ContextualEmptyState context="agents" onPrimaryAction={props.onInviteAgent} onSecondaryAction={props.onConfigurePermissions} />;
}

export function TagsEmptyState(props: { onCreateTag?: () => void; onImportTags?: () => void }) {
  return <ContextualEmptyState context="tags" onPrimaryAction={props.onCreateTag} onSecondaryAction={props.onImportTags} />;
}

export function SearchEmptyState(props: { query?: string; onClearFilters?: () => void; onAdvancedSearch?: () => void }) {
  return <ContextualEmptyState context="search" searchQuery={props.query} onPrimaryAction={props.onClearFilters} onSecondaryAction={props.onAdvancedSearch} />;
}

export function DashboardEmptyState(props: { onGoToInbox?: () => void; onConfigureGoals?: () => void }) {
  return <ContextualEmptyState context="dashboard" onPrimaryAction={props.onGoToInbox} onSecondaryAction={props.onConfigureGoals} />;
}

export function NotificationsEmptyState(props: { onConfigureAlerts?: () => void }) {
  return <ContextualEmptyState context="notifications" onPrimaryAction={props.onConfigureAlerts} compact />;
}

export function TranscriptionsEmptyState(props: { onEnableAutoTranscription?: () => void; onOpenSettings?: () => void }) {
  return <ContextualEmptyState context="transcriptions" onPrimaryAction={props.onEnableAutoTranscription} onSecondaryAction={props.onOpenSettings} />;
}
