import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Mic, User, MessageSquare, Zap, Clock,
  Image, Video, FileDown, Link2, X, Sparkles,
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import type { ResultType, DateFilter, MediaTypeFilter } from '../useGlobalSearchData';

interface GlobalSearchFiltersProps {
  show: boolean;
  activeTypes: Set<ResultType>;
  dateFilter: DateFilter;
  mediaTypeFilter: MediaTypeFilter;
  activeFiltersCount: number;
  onToggleType: (type: ResultType) => void;
  onSetDateFilter: (f: DateFilter) => void;
  onSetMediaTypeFilter: (f: MediaTypeFilter) => void;
  onClearFilters: () => void;
}

export function GlobalSearchFilters({
  show, activeTypes, dateFilter, mediaTypeFilter, activeFiltersCount,
  onToggleType, onSetDateFilter, onSetMediaTypeFilter, onClearFilters,
}: GlobalSearchFiltersProps) {
  const crmIntegrationEnabled = useCRMIntegrationEnabled();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3 p-3 bg-muted/50 rounded-lg space-y-3"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <div className="flex flex-wrap gap-2">
              <Toggle pressed={activeTypes.has('action')} onPressedChange={() => onToggleType('action')} size="sm" className="gap-1.5 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
                <Zap className="h-3.5 w-3.5" /> Ações
              </Toggle>
              <Toggle pressed={activeTypes.has('message')} onPressedChange={() => onToggleType('message')} size="sm" className="gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                <FileText className="h-3.5 w-3.5" /> Textos
              </Toggle>
              <Toggle pressed={activeTypes.has('transcription')} onPressedChange={() => onToggleType('transcription')} size="sm" className="gap-1.5 data-[state=on]:bg-warning data-[state=on]:text-primary-foreground">
                <Mic className="h-3.5 w-3.5" /> Transcrições
              </Toggle>
              <Toggle pressed={activeTypes.has('contact')} onPressedChange={() => onToggleType('contact')} size="sm" className="gap-1.5 data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground">
                <User className="h-3.5 w-3.5" /> Contatos
              </Toggle>
              {crmIntegrationEnabled && (
                <Toggle pressed={activeTypes.has('crm')} onPressedChange={() => onToggleType('crm')} size="sm" className="gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  <Sparkles className="h-3.5 w-3.5" /> CRM
                </Toggle>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Período</label>
            <Select value={dateFilter} onValueChange={(v) => onSetDateFilter(v as DateFilter)}>
              <SelectTrigger className="w-full h-9">
                <Clock className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo período</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="30days">Últimos 30 dias</SelectItem>
                <SelectItem value="90days">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tipo de Mídia</label>
            <div className="flex flex-wrap gap-2">
              <Toggle pressed={mediaTypeFilter === 'all'} onPressedChange={() => onSetMediaTypeFilter('all')} size="sm" className="gap-1.5 data-[state=on]:bg-muted-foreground/20 data-[state=on]:text-foreground">
                <MessageSquare className="h-3.5 w-3.5" /> Todos
              </Toggle>
              <Toggle pressed={mediaTypeFilter === 'text'} onPressedChange={() => onSetMediaTypeFilter(mediaTypeFilter === 'text' ? 'all' : 'text')} size="sm" className="gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                <FileText className="h-3.5 w-3.5" /> Texto
              </Toggle>
              <Toggle pressed={mediaTypeFilter === 'image'} onPressedChange={() => onSetMediaTypeFilter(mediaTypeFilter === 'image' ? 'all' : 'image')} size="sm" className="gap-1.5 data-[state=on]:bg-success data-[state=on]:text-primary-foreground">
                <Image className="h-3.5 w-3.5" /> Imagens
              </Toggle>
              <Toggle pressed={mediaTypeFilter === 'video'} onPressedChange={() => onSetMediaTypeFilter(mediaTypeFilter === 'video' ? 'all' : 'video')} size="sm" className="gap-1.5 data-[state=on]:bg-info data-[state=on]:text-primary-foreground">
                <Video className="h-3.5 w-3.5" /> Vídeos
              </Toggle>
              <Toggle pressed={mediaTypeFilter === 'audio'} onPressedChange={() => onSetMediaTypeFilter(mediaTypeFilter === 'audio' ? 'all' : 'audio')} size="sm" className="gap-1.5 data-[state=on]:bg-warning data-[state=on]:text-primary-foreground">
                <Mic className="h-3.5 w-3.5" /> Áudios
              </Toggle>
              <Toggle pressed={mediaTypeFilter === 'document'} onPressedChange={() => onSetMediaTypeFilter(mediaTypeFilter === 'document' ? 'all' : 'document')} size="sm" className="gap-1.5 data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground">
                <FileDown className="h-3.5 w-3.5" /> Documentos
              </Toggle>
              <Toggle pressed={mediaTypeFilter === 'link'} onPressedChange={() => onSetMediaTypeFilter(mediaTypeFilter === 'link' ? 'all' : 'link')} size="sm" className="gap-1.5 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
                <Link2 className="h-3.5 w-3.5" /> Links
              </Toggle>
            </div>
          </div>

          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={onClearFilters}>
              <X className="h-3 w-3 mr-1" /> Limpar filtros
            </Button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
