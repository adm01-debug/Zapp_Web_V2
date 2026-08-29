import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, BookOpen, FileText, Search, Upload, Trash2, Edit, Brain, CheckCircle, AlertCircle, Clock, File } from 'lucide-react';
import { useKnowledgeBase, CATEGORIES, CATEGORY_LABELS } from '@/hooks/integrations/useKnowledgeBase';

const statusIcon = (status: string) => {
  if (status === 'completed') return <CheckCircle className="w-3.5 h-3.5 text-success" />;
  if (status === 'processing') return <Clock className="w-3.5 h-3.5 text-warning animate-spin" />;
  return <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />;
};

export function KnowledgeBaseView() {
  const { articles, files, loading, fetchData, saveArticle, deleteArticle, uploadFile } = useKnowledgeBase();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('articles');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formTags, setFormTags] = useState('');
  const [formPublished, setFormPublished] = useState(true);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => { setEditingId(null); setFormTitle(''); setFormContent(''); setFormCategory('general'); setFormTags(''); setFormPublished(true); setShowEditor(true); };
  const openEdit = (a: typeof articles[0]) => { setEditingId(a.id); setFormTitle(a.title); setFormContent(a.content); setFormCategory(a.category); setFormTags(a.tags.join(', ')); setFormPublished(a.is_published); setShowEditor(true); };

  const save = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    const ok = await saveArticle({ title: formTitle, content: formContent, category: formCategory, tags: formTags.split(',').map(t => t.trim()).filter(Boolean), is_published: formPublished }, editingId || undefined);
    if (ok) setShowEditor(false);
  };

  const filteredArticles = articles.filter(a => {
    const matchesSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.content.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (selectedCategory === 'all' || a.category === selectedCategory);
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Base de Conhecimento" subtitle="Treine a IA com documentos e artigos da sua empresa"
        actions={<div className="flex gap-2">
          <label><Button variant="outline" className="gap-2" asChild><span><Upload className="w-4 h-4" /> Upload</span></Button>
            <input type="file" className="hidden" accept=".pdf,.txt,.md,.doc,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} /></label>
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Novo Artigo</Button>
        </div>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pb-4">
        {[
          { icon: BookOpen, color: 'bg-primary/20', textColor: 'text-primary', label: 'Artigos', value: articles.length },
          { icon: File, color: 'bg-secondary/20', textColor: 'text-secondary', label: 'Arquivos', value: files.length },
          { icon: CheckCircle, color: 'bg-success/20', textColor: 'text-success', label: 'Publicados', value: articles.filter(a => a.is_published).length },
          { icon: Brain, color: 'bg-primary/20', textColor: 'text-primary', label: 'Indexados', value: articles.filter(a => a.embedding_status === 'completed').length },
        ].map(({ icon: Icon, color, textColor, label, value }) => (
          <Card key={label} className="bg-card/50 border-border/30"><CardContent className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}><Icon className={`w-5 h-5 ${textColor}`} /></div>
            <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold">{value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 px-6">
        <TabsList><TabsTrigger value="articles">Artigos</TabsTrigger><TabsTrigger value="files">Arquivos</TabsTrigger></TabsList>
        <TabsContent value="articles" className="flex-1 mt-4">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar artigos..." className="pl-9" /></div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6 overflow-y-auto">
            <AnimatePresence>{filteredArticles.map((article) => (
              <motion.div key={article.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="bg-card/50 border-border/30 hover:border-secondary/30 transition-all group h-full"><CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">{statusIcon(article.embedding_status)}<Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[article.category] || article.category}</Badge></div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(article)}><Edit className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteArticle(article.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">{article.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-3 mb-3">{article.content}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {article.tags.slice(0, 3).map(tag => <Badge key={tag} variant="secondary" className="text-[10px] h-4">{tag}</Badge>)}
                    {!article.is_published && <Badge variant="outline" className="text-[10px] h-4 text-warning border-yellow-400/30">Rascunho</Badge>}
                  </div>
                </CardContent></Card>
              </motion.div>
            ))}</AnimatePresence>
          </div>
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          <div className="space-y-2 pb-6">
            {files.map(file => (
              <Card key={file.id} className="bg-card/50 border-border/30"><CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center"><FileText className="w-5 h-5 text-muted-foreground" /></div>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{file.file_name}</p><p className="text-xs text-muted-foreground">{file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : 'N/A'} • {new Date(file.created_at).toLocaleDateString('pt-BR')}</p></div>
                <div className="flex items-center gap-2">{statusIcon(file.processing_status)}<Badge variant="outline" className="text-[10px]">{file.processing_status}</Badge></div>
              </CardContent></Card>
            ))}
            {files.length === 0 && <div className="text-center py-12 text-muted-foreground"><Upload className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">Nenhum arquivo enviado</p></div>}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent aria-describedby={undefined} size="xl">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Artigo' : 'Novo Artigo'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Título *</Label><Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Título do artigo" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Categoria</Label><Select value={formCategory} onValueChange={setFormCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Tags (separadas por vírgula)</Label><Input value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="tag1, tag2" /></div>
            </div>
            <div><Label>Conteúdo *</Label><Textarea value={formContent} onChange={(e) => setFormContent(e.target.value)} rows={12} placeholder="Escreva o conteúdo do artigo..." className="font-mono text-sm" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowEditor(false)}>Cancelar</Button><Button onClick={save}>{editingId ? 'Salvar' : 'Criar'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
