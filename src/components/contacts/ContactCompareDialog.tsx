import { motion } from 'framer-motion';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, Mail, Building, Briefcase, Tag, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import type { Contact } from './types';

interface ContactCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
}

const FIELDS: { key: keyof Contact; label: string; icon: React.ReactNode }[] = [
  { key: 'phone', label: 'Telefone', icon: <Phone className="w-3.5 h-3.5" /> },
  { key: 'email', label: 'Email', icon: <Mail className="w-3.5 h-3.5" /> },
  { key: 'company', label: 'Empresa', icon: <Building className="w-3.5 h-3.5" /> },
  { key: 'job_title', label: 'Cargo', icon: <Briefcase className="w-3.5 h-3.5" /> },
  { key: 'contact_type', label: 'Tipo', icon: <Tag className="w-3.5 h-3.5" /> },
];

export function ContactCompareDialog({ open, onOpenChange, contacts }: ContactCompareDialogProps) {
  if (contacts.length < 2) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Comparar Contatos</DialogTitle>
          <DialogDescription>Comparação lado a lado de {contacts.length} contatos selecionados</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground w-28">Campo</th>
                  {contacts.map((c, i) => (
                    <th key={c.id} className="p-3 text-center">
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex flex-col items-center gap-2"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={c.avatar_url || undefined} />
                          <AvatarFallback className={cn(getAvatarColor(c.name).bg, getAvatarColor(c.name).text)}>
                            {getInitials(c.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-foreground text-xs">{c.name}</span>
                      </motion.div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELDS.map((field, fi) => {
                  const values = contacts.map(c => String(c[field.key] || ''));
                  const allSame = values.every(v => v === values[0]);

                  return (
                    <motion.tr
                      key={field.key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: fi * 0.03 }}
                      className={cn('border-b', !allSame && 'bg-primary/5')}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          {field.icon}
                          {field.label}
                        </div>
                      </td>
                      {contacts.map(c => {
                        const val = String(c[field.key] || '');
                        return (
                          <td key={c.id} className="p-3 text-center">
                            {val ? (
                              <span className="text-xs text-foreground">{val}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40 italic">—</span>
                            )}
                          </td>
                        );
                      })}
                    </motion.tr>
                  );
                })}

                {/* Tags row */}
                <motion.tr
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: FIELDS.length * 0.03 }}
                  className="border-b"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Tag className="w-3.5 h-3.5" />
                      Tags
                    </div>
                  </td>
                  {contacts.map(c => (
                    <td key={c.id} className="p-3 text-center">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {(c.tags || []).length > 0
                          ? c.tags!.map(t => <Badge key={t} variant="secondary" className="text-[10px] h-4">{t}</Badge>)
                          : <span className="text-xs text-muted-foreground/40 italic">—</span>
                        }
                      </div>
                    </td>
                  ))}
                </motion.tr>

                {/* Created at */}
                <motion.tr
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (FIELDS.length + 1) * 0.03 }}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      Criado em
                    </div>
                  </td>
                  {contacts.map(c => (
                    <td key={c.id} className="p-3 text-center text-xs text-foreground">
                      {format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                  ))}
                </motion.tr>
              </tbody>
            </table>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
