import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MessageSquare, User } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface QueueContact {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
  assigned_to: string | null;
  created_at: string;
  assigned_agent?: { name: string | null; avatar_url: string | null } | null;
  messages_count: number;
  last_message_at: string | null;
}

export function QueueContactsTable({ contacts }: { contacts: QueueContact[] }) {
  return (
    <Card className="lg:col-span-2 border border-secondary/20 bg-card/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><MessageSquare className="w-5 h-5" />Histórico de Atendimentos</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {contacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><User className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhum contato nesta fila ainda</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/20">
                  <TableHead>Contato</TableHead><TableHead>Atendente</TableHead><TableHead>Mensagens</TableHead><TableHead>Última Atividade</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id} className="border-border/20 hover:bg-muted/10">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8"><AvatarImage src={contact.avatar_url || undefined} /><AvatarFallback className="bg-primary/10 text-primary text-xs">{contact.name[0]}</AvatarFallback></Avatar>
                        <div><p className="font-medium text-foreground">{contact.name}</p><p className="text-xs text-muted-foreground">{contact.phone}</p></div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {contact.assigned_agent ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6"><AvatarImage src={contact.assigned_agent.avatar_url || undefined} /><AvatarFallback className="text-xs">{(contact.assigned_agent.name || '?')[0]}</AvatarFallback></Avatar>
                          <span className="text-sm">{contact.assigned_agent.name}</span>
                        </div>
                      ) : <Badge variant="outline" className="text-warning border-warning/30">Aguardando</Badge>}
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="bg-muted/30">{contact.messages_count}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {contact.last_message_at ? formatDistanceToNow(new Date(contact.last_message_at), { addSuffix: true, locale: ptBR }) : format(new Date(contact.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={contact.assigned_to ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}>
                        {contact.assigned_to ? 'Em atendimento' : 'Na fila'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
