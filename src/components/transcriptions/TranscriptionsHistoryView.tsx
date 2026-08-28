import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Search, Calendar, X, RefreshCw } from 'lucide-react';
import { isToday, isThisWeek, isThisMonth } from 'date-fns';
import { TranscriptionContactGroup } from './TranscriptionContactGroup';

interface TranscriptionRecord {
  id: string; content: string; transcription: string; media_url: string | null;
  created_at: string; contact_id: string; contact_name: string; contact_phone: string; contact_avatar: string | null;
}

type DateFilter = 'all' | 'today' | 'week' | 'month';

export function TranscriptionsHistoryView() {
  const [transcriptions, setTranscriptions] = useState<TranscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set());

  const fetchTranscriptions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`id, content, transcription, media_url, created_at, contact_id, contacts!inner (id, name, phone, avatar_url)`)
        .eq('message_type', 'audio')
        .not('transcription', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTranscriptions((data || []).map((item: any) => ({
        id: item.id, content: item.content, transcription: item.transcription, media_url: item.media_url,
        created_at: item.created_at, contact_id: item.contact_id,
        contact_name: item.contacts?.name || 'Desconhecido', contact_phone: item.contacts?.phone || '', contact_avatar: item.contacts?.avatar_url || null,
      })));
    } catch (error) { log.error('Error fetching transcriptions:', error); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTranscriptions(); }, []);

  const filteredTranscriptions = useMemo(() => {
    let filtered = transcriptions;
    if (dateFilter !== 'all') {
      filtered = filtered.filter((t) => {
        const date = new Date(t.created_at);
        if (dateFilter === 'today') return isToday(date);
        if (dateFilter === 'week') return isThisWeek(date);
        if (dateFilter === 'month') return isThisMonth(date);
        return true;
      });
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => t.transcription.toLowerCase().includes(query) || t.contact_name.toLowerCase().includes(query) || t.contact_phone.includes(query));
    }
    return filtered;
  }, [transcriptions, dateFilter, searchQuery]);

  const groupedByContact = useMemo(() => {
    const grouped: Record<string, { contact: { id: string; name: string; phone: string; avatar: string | null }; transcriptions: TranscriptionRecord[] }> = {};
    filteredTranscriptions.forEach((t) => {
      if (!grouped[t.contact_id]) grouped[t.contact_id] = { contact: { id: t.contact_id, name: t.contact_name, phone: t.contact_phone, avatar: t.contact_avatar }, transcriptions: [] };
      grouped[t.contact_id].transcriptions.push(t);
    });
    return grouped;
  }, [filteredTranscriptions]);

  const toggleContact = (id: string) => setExpandedContacts(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const expandAll = () => setExpandedContacts(new Set(Object.keys(groupedByContact)));
  const collapseAll = () => setExpandedContacts(new Set());

  if (loading) {
    return (
      <div className="p-6 space-y-6 overflow-y-auto h-full relative bg-background">
        <AuroraBorealis /><FloatingParticles />
        <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative bg-background">
      <AuroraBorealis /><FloatingParticles />
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between relative z-10">
        <div>
          <h1 className="text-2xl font-bold text-foreground neon-underline flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center"><Mic className="w-5 h-5 text-primary-foreground" /></div>
            Histórico de Transcrições
          </h1>
          <p className="text-muted-foreground mt-1">{filteredTranscriptions.length} transcrições de {Object.keys(groupedByContact).length} contatos</p>
        </div>
        <Button onClick={fetchTranscriptions} variant="outline" size="sm"><RefreshCw className="w-4 h-4 mr-2" />Atualizar</Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-wrap items-center gap-3 relative z-10">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar em transcrições..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          {searchQuery && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearchQuery('')}><X className="w-3 h-3" /></Button>}
        </div>
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="w-[160px]"><Calendar className="w-4 h-4 mr-2" /><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo período</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="week">Esta semana</SelectItem>
            <SelectItem value="month">Este mês</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}>Expandir todos</Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>Recolher todos</Button>
        </div>
      </motion.div>

      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-4 relative z-10 pr-4">
          <AnimatePresence>
            {Object.keys(groupedByContact).length === 0 ? (
              <EmptyState icon={Mic} title={searchQuery ? 'Nenhum resultado encontrado' : 'Nenhuma transcrição ainda'}
                description={searchQuery ? 'Tente ajustar os termos da busca ou filtros' : 'Transcrições de áudios aparecerão aqui automaticamente'}
                illustration="transcriptions" secondaryActionLabel={searchQuery ? 'Limpar busca' : undefined} onSecondaryAction={searchQuery ? () => setSearchQuery('') : undefined}
              />
            ) : (
              Object.entries(groupedByContact).map(([contactId, { contact, transcriptions }], index) => (
                <TranscriptionContactGroup key={contactId} contact={contact} transcriptions={transcriptions}
                  isExpanded={expandedContacts.has(contactId)} onToggle={() => toggleContact(contactId)} index={index}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
