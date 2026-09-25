import { useAuth } from '@/hooks/auth/useAuth';
import { RemindersPanel } from '../RemindersPanel';

interface RemindersTabProps {
  contactId: string;
}

/**
 * Aba Lembretes do painel do chat. Fina wrapper sobre o RemindersPanel
 * original (restaurado do historico) so pra resolver o profileId via
 * useAuth, no mesmo padrao de TasksTab/NotesTab.
 */
export function RemindersTab({ contactId }: RemindersTabProps) {
  const { profile } = useAuth();
  return <RemindersPanel contactId={contactId} profileId={profile?.id} />;
}
