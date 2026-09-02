import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AdvancedCRMSearch } from '@/components/contacts/AdvancedCRMSearch';

interface ContactCRMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactSelected: (contactId: string) => void;
}

export function ContactCRMDialog({ open, onOpenChange, onContactSelected }: ContactCRMDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />Busca avançada — CRM 360°
          </DialogTitle>
          <DialogDescription>Pesquise contatos no CRM com filtros por vendedor, empresa, ramo, estado e segmento</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <AdvancedCRMSearch
            onSelectContact={async (crmContact) => {
              if (!crmContact.phone_primary) return;
              const cleanPhone = crmContact.phone_primary.replace(/\D/g, '');
              const { data: existing } = await supabase
                .from('contacts').select('id')
                .or(`phone.eq.${crmContact.phone_primary},phone.eq.${cleanPhone}`)
                .limit(1);
              if (existing && existing.length > 0) {
                onOpenChange(false);
                onContactSelected(existing[0].id);
              } else {
                const { data: newC, error } = await supabase
                  .from('contacts')
                  .insert({
                    name: crmContact.full_name || crmContact.nome_tratamento || 'Contato CRM',
                    phone: crmContact.phone_primary.replace(/\D/g, ''),
                    email: crmContact.email_primary || undefined,
                    company: crmContact.company_name || undefined,
                    job_title: crmContact.cargo || undefined,
                    contact_type: 'cliente',
                  })
                  .select('id').single();
                if (error) { toast.error('Erro ao importar contato'); return; }
                toast.success('Contato importado do CRM!');
                onOpenChange(false);
                if (newC) onContactSelected(newC.id);
              }
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
