import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { sections, totalFeatures } from './featuresSectionsData';

export function SystemFeaturesView() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  const toggleSection = (id: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedSections(new Set(sections.map(s => s.id)));
  const collapseAll = () => setExpandedSections(new Set());

  const filteredSections = searchTerm
    ? sections.filter(s =>
        s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.items.some(i => i.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : sections;

  return (
    <div className="h-full flex flex-col bg-background w-full min-w-0">
      <div className="border-b border-border px-6 py-4 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
              📋 Funcionalidades do Sistema
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-semibold text-primary">{totalFeatures}+</span> funcionalidades em{' '}
              <span className="font-semibold text-primary">34</span> seções •{' '}
              <Badge variant="default" className="text-xs">100% Implementado</Badge>
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={expandAll} className="text-xs text-primary hover:underline">Expandir tudo</button>
            <span className="text-muted-foreground">|</span>
            <button onClick={collapseAll} className="text-xs text-primary hover:underline">Recolher tudo</button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar funcionalidade..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 grid gap-3">
          {filteredSections.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSections.has(section.id) || !!searchTerm;
            const filteredItems = searchTerm
              ? section.items.filter(i => i.toLowerCase().includes(searchTerm.toLowerCase()))
              : section.items;

            return (
              <motion.div key={section.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: section.id * 0.02 }}>
                <Card className="cursor-pointer hover:shadow-md transition-shadow border-border/50" onClick={() => !searchTerm && toggleSection(section.id)}>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg bg-muted ${section.color}`}><Icon className="w-4 h-4" /></div>
                        <span className="font-semibold text-foreground">{section.id}. {section.title}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{section.items.length}</Badge>
                      </div>
                      {!searchTerm && (isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />)}
                    </CardTitle>
                  </CardHeader>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                        <CardContent className="pt-0 pb-4 px-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {filteredItems.map((item, idx) => (
                              <motion.div key={idx} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.01 }}
                                className="flex items-start gap-2 text-sm text-foreground/80 py-1 px-2 rounded-md hover:bg-muted/50 transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                                <span>{item}</span>
                              </motion.div>
                            ))}
                          </div>
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
