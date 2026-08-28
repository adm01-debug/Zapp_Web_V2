import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ViewersIndicator } from './collaboration/ViewersIndicator';
import { InternalNotesPanel } from './collaboration/InternalNotesPanel';
import { HandoffDialog } from './collaboration/HandoffDialog';

interface RealtimeCollaborationProps {
  contactId: string;
  className?: string;
}

export function RealtimeCollaboration({ contactId, className }: RealtimeCollaborationProps) {
  const [handoffOpen, setHandoffOpen] = useState(false);

  const handleHandoff = async (agentId: string, comment: string) => {
    await supabase.from('contacts').update({ assigned_to: agentId }).eq('id', contactId);
    if (comment) {
      const { data: profile } = await supabase
        .from('profiles').select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();
      if (profile) {
        await supabase.from('contact_notes').insert({
          contact_id: contactId, author_id: profile.id, content: `Transferido: ${comment}`,
        });
      }
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <ViewersIndicator contactId={contactId} />
        <Button variant="outline" size="sm" onClick={() => setHandoffOpen(true)}>
          <Users className="w-4 h-4 mr-2" />Transferir
        </Button>
      </div>
      <InternalNotesPanel contactId={contactId} />
      <HandoffDialog open={handoffOpen} onOpenChange={setHandoffOpen} contactId={contactId} onHandoff={handleHandoff} />
    </div>
  );
}

export { ViewersIndicator, InternalNotesPanel, HandoffDialog };
