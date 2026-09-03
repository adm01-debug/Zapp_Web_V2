import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sticker, SmilePlus, Search, Trash2, Loader2, Upload, X,
  Play, Pause, Star, Edit2, Check,
  Image as ImageIcon, Volume2, Package,
  Filter, RefreshCw, AlertTriangle, Wand2, Sparkles
} from 'lucide-react';

import { useMediaLibrary } from './media-library/useMediaLibrary';
import { useMediaUpload } from './media-library/useMediaUpload';
import type { MediaItem, MediaType } from './media-library/useMediaLibrary';
import { StatsCards } from './media-library/StatsCards';
import { AIGenerateDialog } from './media-library/AIGenerateDialog';

function InlineCategorySelect({ value, categories, onChange }: { value: string; categories: Record<string, string>; onChange: (cat: string) => void }) {
  const allCategories = { ...categories };
  if (value && !(value in allCategories)) allCategories[value] = '❓';
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-6 text-[10px] w-[130px] border-border/40"><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(allCategories).map(([cat, emoji]) => <SelectItem key={cat} value={cat} className="text-xs">{emoji} {cat}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function MediaAdminPanel({ type }: { type: MediaType }) {
  const lib = useMediaLibrary(type);
  const upload = useMediaUpload(type, lib.fetchItems);
  const [showGenDialog, setShowGenDialog] = useState(false);

  return (
    <div className="space-y-4">
      <StatsCards items={lib.items} type={type} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={lib.search} onChange={e => lib.setSearch(e.target.value)} placeholder="Buscar por nome ou categoria..." className="pl-9 h-9 text-sm" />
        </div>
        <Select value={lib.filterCategory} onValueChange={lib.setFilterCategory}>
          <SelectTrigger className="w-[160px] h-9 text-sm"><Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas ({lib.items.length})</SelectItem>{lib.existingCategories.map(cat => <SelectItem key={cat} value={cat}>{lib.categories[cat] || '📦'} {cat} ({lib.items.filter(i => i.category === cat).length})</SelectItem>)}</SelectContent>
        </Select>
        <input ref={upload.fileInputRef} type="file" accept={upload.acceptTypes} className="hidden" multiple onChange={upload.handleBulkUpload} />
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => upload.fileInputRef.current?.click()} disabled={upload.bulkUploading}>
          {upload.bulkUploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{upload.uploadProgress}%</> : <><Upload className="w-3.5 h-3.5" />Upload em massa</>}
        </Button>
        {type === 'audio_memes' && <Button variant="default" size="sm" className="h-9 gap-1.5" onClick={() => setShowGenDialog(true)}><Sparkles className="w-3.5 h-3.5" /> Gerar com IA</Button>}
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={lib.fetchItems}><RefreshCw className="w-3.5 h-3.5" /> Atualizar</Button>
      </div>

      {type === 'audio_memes' && <AIGenerateDialog open={showGenDialog} onOpenChange={setShowGenDialog} onSaved={lib.fetchItems} />}

      <AnimatePresence>
        {lib.selected.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
            <Badge variant="secondary" className="text-xs">{lib.selected.size} selecionados</Badge>
            <Select onValueChange={lib.handleBulkCategoryChange}><SelectTrigger className="w-[150px] h-7 text-xs"><SelectValue placeholder="Mover para..." /></SelectTrigger><SelectContent>{Object.entries(lib.categories).map(([cat, emoji]) => <SelectItem key={cat} value={cat} className="text-xs">{emoji} {cat}</SelectItem>)}</SelectContent></Select>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={lib.handleBulkReclassify} disabled={lib.reclassifying}>{lib.reclassifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}{lib.reclassifying ? 'Classificando...' : 'Reclassificar IA'}</Button>
            <AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" size="sm" className="h-7 text-xs gap-1"><Trash2 className="w-3 h-3" /> Excluir selecionados</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Confirmar exclusão em massa</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir {lib.selected.size} itens?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={lib.handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir {lib.selected.size} itens</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={() => lib.setSelected(new Set())}>Limpar seleção</Button>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="border-border/50">
        <ScrollArea className="h-[500px]">
          <div className="sticky top-0 z-10 flex items-center gap-3 px-3 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground overflow-x-hidden">
            <Checkbox checked={lib.filtered.length > 0 && lib.selected.size === lib.filtered.length} onCheckedChange={lib.toggleSelectAll} className="mr-1" />
            <span className="w-12">Preview</span><span className="flex-1">Nome</span><span className="w-[130px]">Categoria</span><span className="w-16 text-center">Usos</span><span className="w-12 text-center">⭐</span><span className="w-24 text-right">Ações</span>
          </div>
          <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {lib.loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>
            ) : lib.filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center"><Package className="w-10 h-10 text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">Nenhum item encontrado</p></div>
            ) : (
              lib.filtered.map(item => {
                const url = type === 'audio_memes' ? item.audio_url : item.image_url;
                const isEditing = lib.editingId === item.id;
                return (
                  <div key={item.id} className={cn('flex items-center gap-3 px-3 py-2 border-b border-border/30 hover:bg-muted/20 transition-colors', lib.selected.has(item.id) && 'bg-primary/5')}>
                    <Checkbox checked={lib.selected.has(item.id)} onCheckedChange={() => lib.toggleSelect(item.id)} />
                    <div className="w-12 h-10 shrink-0">
                      {type === 'audio_memes' ? (
                        <button onClick={() => lib.handlePreview(item)} className={cn('w-10 h-10 rounded-lg flex items-center justify-center transition-colors', lib.playingId === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-primary/20')}>
                          {lib.playingId === item.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                      ) : (
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted/30 border border-border/30">
                          {url ? <img src={url} alt={item.name || ''} className="w-full h-full object-contain p-0.5" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-4 h-4 text-muted-foreground/40" /></div>}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input value={lib.editName} onChange={e => lib.setEditName(e.target.value)} className="h-7 text-xs" autoFocus onKeyDown={e => { if (e.key === 'Enter') lib.handleRename(item); if (e.key === 'Escape') lib.setEditingId(null); }} />
                          <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => lib.handleRename(item)}><Check className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => lib.setEditingId(null)}><X className="w-3 h-3" /></Button>
                        </div>
                      ) : <p className="text-xs font-medium text-foreground truncate">{item.name || 'Sem nome'}</p>}
                    </div>
                    <div className="w-[130px]"><InlineCategorySelect value={item.category} categories={lib.categories} onChange={(cat) => lib.handleSingleCategoryChange(item, cat)} /></div>
                    <div className="w-16 text-center"><Badge variant="secondary" className="text-[9px]">{item.use_count || 0}x</Badge></div>
                    <div className="w-12 text-center"><button onClick={() => lib.handleToggleFavorite(item)} className="p-1 rounded hover:bg-muted/50 transition-colors"><Star className={cn('w-3.5 h-3.5 mx-auto transition-colors', item.is_favorite ? 'fill-warning text-warning' : 'text-muted-foreground/30 hover:text-warning')} /></button></div>
                    <div className="w-24 flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => { lib.setEditingId(item.id); lib.setEditName(item.name || ''); }}><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                      <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="w-7 h-7"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir item</AlertDialogTitle><AlertDialogDescription>Excluir "{item.name || 'Sem nome'}" permanentemente?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => lib.handleDelete(item)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </div>
        </ScrollArea>
      </Card>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Exibindo {lib.filtered.length} de {lib.items.length} itens</span>
        {lib.selected.size > 0 && <span>{lib.selected.size} selecionados</span>}
      </div>
    </div>
  );
}

export function MediaLibraryAdmin() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Package className="w-5 h-5 text-primary" /></div>
        <div><h3 className="text-lg font-semibold text-foreground">Biblioteca de Mídia</h3><p className="text-sm text-muted-foreground">Gerencie figurinhas, áudios meme e emojis customizados</p></div>
      </div>
      <Tabs defaultValue="stickers" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="stickers" className="gap-1.5 text-sm"><Sticker className="w-4 h-4" />Figurinhas</TabsTrigger>
          <TabsTrigger value="audio_memes" className="gap-1.5 text-sm"><Volume2 className="w-4 h-4" />Áudios Meme</TabsTrigger>
          <TabsTrigger value="custom_emojis" className="gap-1.5 text-sm"><SmilePlus className="w-4 h-4" />Emojis</TabsTrigger>
        </TabsList>
        <TabsContent value="stickers"><MediaAdminPanel type="stickers" /></TabsContent>
        <TabsContent value="audio_memes"><MediaAdminPanel type="audio_memes" /></TabsContent>
        <TabsContent value="custom_emojis"><MediaAdminPanel type="custom_emojis" /></TabsContent>
      </Tabs>
    </div>
  );
}
