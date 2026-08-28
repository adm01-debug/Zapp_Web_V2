import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { toast } from 'sonner';
import { ShieldBan, Trash2, Plus, Search, UserX, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface BlacklistEntry {
  id: string;
  contact_id: string;
  reason: string | null;
  created_at: string;
  contacts: {
    name: string;
    phone: string;
    company: string | null;
    avatar_url: string | null;
  } | null;
}

const OPT_OUT_REASONS = [
  'Solicitação do cliente',
  'Número inválido / bounce',
  'Reclamação de spam',
  'Contato duplicado',
  'Outro',
];

export function TalkXBlacklist() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [reason, setReason] = useState(OPT_OUT_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [contactSearch, setContactSearch] = useState('');

  const { data: blacklist = [], isLoading } = useQuery({
    queryKey: ['talkx-blacklist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_blacklist')
        .select('*, contacts:contact_id(name, phone, company, avatar_url)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BlacklistEntry[];
    },
  });

  const { data: availableContacts = [] } = useQuery({
    queryKey: ['contacts-for-blacklist'],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, company')
        .not('phone', 'is', null)
        .order('name');
      return data || [];
    },
    enabled: showAddDialog,
  });

  const blacklistedIds = useMemo(
    () => new Set(blacklist.map((b) => b.contact_id)),
    [blacklist]
  );

  const filteredAvailable = useMemo(() => {
    const nonBlocked = availableContacts.filter((c) => !blacklistedIds.has(c.id));
    if (!contactSearch.trim()) return nonBlocked.slice(0, 50);
    const q = contactSearch.toLowerCase();
    return nonBlocked
      .filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q))
      .slice(0, 50);
  }, [availableContacts, blacklistedIds, contactSearch]);

  const filteredBlacklist = useMemo(() => {
    if (!search.trim()) return blacklist;
    const q = search.toLowerCase();
    return blacklist.filter(
      (b) =>
        b.contacts?.name?.toLowerCase().includes(q) ||
        b.contacts?.phone?.includes(q) ||
        b.reason?.toLowerCase().includes(q)
    );
  }, [blacklist, search]);

  const addMutation = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from('profiles').select('id').single();
      const finalReason = reason === 'Outro' ? customReason || 'Outro' : reason;
      const { error } = await fromTable('talkx_blacklist')
        .insert({ contact_id: selectedContactId, reason: finalReason, blocked_by: profile?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-blacklist'] });
      toast.success('Contato adicionado à lista negra');
      setShowAddDialog(false);
      setSelectedContactId('');
      setReason(OPT_OUT_REASONS[0]);
      setCustomReason('');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('talkx_blacklist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-blacklist'] });
      toast.success('Contato removido da lista negra');
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldBan className="w-5 h-5 text-destructive" />
          <h3 className="font-semibold text-foreground">Lista Negra / Opt-out</h3>
          <Badge variant="secondary" className="text-[10px]">{blacklist.length}</Badge>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar à Lista Negra</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Buscar contato</Label>
                <Input
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Nome ou telefone..."
                  className="mt-1"
                />
                <div className="max-h-40 overflow-auto mt-2 rounded-lg border divide-y">
                  {filteredAvailable.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhum contato encontrado</p>
                  ) : (
                    filteredAvailable.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedContactId(c.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          selectedContactId === c.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                        }`}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div>
                <Label>Motivo</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPT_OUT_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {reason === 'Outro' && (
                  <Textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Descreva o motivo..."
                    className="mt-2"
                    rows={2}
                  />
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={!selectedContactId || addMutation.isPending}
                className="gap-1.5"
              >
                <ShieldBan className="w-4 h-4" />
                Bloquear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {blacklist.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar na lista negra..."
            className="pl-9 h-9 text-sm"
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-muted" />
              <div className="flex-1 space-y-1">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredBlacklist.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-8 gap-2">
            <UserX className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search ? 'Nenhum resultado' : 'Nenhum contato na lista negra'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filteredBlacklist.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center text-xs font-bold text-destructive shrink-0">
                {entry.contacts?.avatar_url ? (
                  <img src={entry.contacts.avatar_url} alt="" className="w-full h-full rounded-full object-cover"  loading="lazy" decoding="async"/>
                ) : (
                  (entry.contacts?.name || '?')[0].toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{entry.contacts?.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{entry.contacts?.phone}</span>
                  {entry.reason && (
                    <Badge variant="outline" className="text-[9px] h-4">
                      {entry.reason}
                    </Badge>
                  )}
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover da lista negra?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {entry.contacts?.name} poderá receber mensagens do Talk X novamente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => removeMutation.mutate(entry.id)}>
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 p-3 bg-destructive/5 rounded-xl border border-destructive/10">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Contatos na lista negra são automaticamente excluídos de todos os disparos do Talk X.
        </p>
      </div>
    </div>
  );
}
