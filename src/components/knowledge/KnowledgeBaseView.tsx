import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  BookOpen,
  FileText,
  Search,
  Upload,
  Trash2,
  Edit,
  Brain,
  CheckCircle,
  AlertCircle,
  Clock,
  File,
  RefreshCw,
} from 'lucide-react';
import {
  useKnowledgeBase,
  CATEGORIES,
  CATEGORY_LABELS,
} from '@/hooks/integrations/useKnowledgeBase';
import type { KBFile } from '@/hooks/integrations/useKnowledgeBase';

const statusIcon = (status: string) => {
  if (status === 'completed') return <CheckCircle className="h-3.5 w-3.5 text-success" />;
  if (status === 'processing') return <Clock className="h-3.5 w-3.5 animate-spin text-warning" />;
  return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
};

/** Motivo legível da falha de processamento — texto fixo, sem expor o conteúdo do arquivo. */
const MOTIVO_FALHA =
  'Falha no processamento: não foi possível extrair o texto deste arquivo. Reprocesse ou exclua o arquivo.';

export function KnowledgeBaseView() {
  // CT-70 — com "reduzir movimento" ligado, os cards entram já no estado final.
  const prefersReducedMotion = useReducedMotion();
  const {
    articles,
    files,
    loading,
    error,
    fetchData,
    saveArticle,
    deleteArticle,
    uploadFile,
    deleteFile,
    reprocessFile,
  } = useKnowledgeBase();
  // Trava por arquivo: o `ref` barra o segundo clique no MESMO botão antes do
  // re-render (dois cliques no mesmo tick); o estado só pinta o `aria-busy`.
  // Linhas diferentes seguem livres — a ação é por arquivo.
  const deletingRef = useRef<Set<string>>(new Set());
  const reprocessingRef = useRef<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set());
  // Excluir é destrutivo e sem volta: o clique na linha só abre o diálogo; a
  // exclusão só sai na confirmação. Guardamos o botão de origem para devolver o foco.
  const [fileToDelete, setFileToDelete] = useState<{ id: string; name: string } | null>(null);
  const deleteOriginRef = useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openNew = () => {
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
    setFormCategory('general');
    setFormTags('');
    setFormPublished(true);
    setShowEditor(true);
  };
  const openEdit = (a: (typeof articles)[0]) => {
    setEditingId(a.id);
    setFormTitle(a.title);
    setFormContent(a.content);
    setFormCategory(a.category);
    setFormTags(a.tags.join(', '));
    setFormPublished(a.is_published);
    setShowEditor(true);
  };

  const save = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    const ok = await saveArticle(
      {
        title: formTitle,
        content: formContent,
        category: formCategory,
        tags: formTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        is_published: formPublished,
      },
      editingId || undefined
    );
    if (ok) setShowEditor(false);
  };

  const openDeleteDialog = (file: KBFile, origin: HTMLButtonElement | null) => {
    if (deletingRef.current.has(file.id)) return;
    deleteOriginRef.current = origin;
    setFileToDelete({ id: file.id, name: file.file_name });
  };

  const handleDeleteFile = async (id: string) => {
    if (deletingRef.current.has(id)) return;
    deletingRef.current.add(id);
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await deleteFile(id);
    } finally {
      deletingRef.current.delete(id);
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleReprocessFile = async (id: string, status: string) => {
    if (reprocessingRef.current.has(id) || status === 'processing') return;
    reprocessingRef.current.add(id);
    setReprocessingIds((prev) => new Set(prev).add(id));
    try {
      await reprocessFile(id);
    } finally {
      reprocessingRef.current.delete(id);
      setReprocessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const confirmDeleteFile = () => {
    if (fileToDelete) void handleDeleteFile(fileToDelete.id);
  };

  const filteredArticles = articles.filter((a) => {
    const matchesSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (selectedCategory === 'all' || a.category === selectedCategory);
  });

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <PageHeader
        title="Base de Conhecimento"
        subtitle="Treine a IA com documentos e artigos da sua empresa"
        actions={
          <div className="flex gap-2">
            <label>
              <Button variant="outline" className="gap-2" asChild>
                <span>
                  <Upload className="h-4 w-4" /> Upload
                </span>
              </Button>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.txt,.md,.doc,.docx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                }}
              />
            </label>
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Artigo
            </Button>
          </div>
        }
      />

      {error ? (
        // t_1944d290: leitura quebrada não pode virar "base vazia" — nem
        // contadores zerados fabricados, nem "Nenhum arquivo enviado" (as
        // duas leituras diriam "sem dado" quando o dado é que não chegou).
        <div className="px-6">
          <Card className="border-destructive/30" data-testid="kb-error">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p role="alert" className="text-muted-foreground">
                Não foi possível carregar a base de conhecimento
              </p>
              <Button variant="outline" onClick={fetchData}>
                <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 px-6 pb-4 md:grid-cols-4">
            {[
              {
                icon: BookOpen,
                color: 'bg-primary/20',
                textColor: 'text-primary',
                label: 'Artigos',
                value: articles.length,
              },
              {
                icon: File,
                color: 'bg-secondary/20',
                textColor: 'text-secondary',
                label: 'Arquivos',
                value: files.length,
              },
              {
                icon: CheckCircle,
                color: 'bg-success/20',
                textColor: 'text-success',
                label: 'Publicados',
                value: articles.filter((a) => a.is_published).length,
              },
              {
                icon: Brain,
                color: 'bg-primary/20',
                textColor: 'text-primary',
                label: 'Indexados',
                value: articles.filter((a) => a.embedding_status === 'completed').length,
              },
            ].map(({ icon: Icon, color, textColor, label, value }) => (
              <Card key={label} className="border-border/30 bg-card/50">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${textColor}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-bold">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 px-6">
            <TabsList>
              <TabsTrigger value="articles">Artigos</TabsTrigger>
              <TabsTrigger value="files">Arquivos</TabsTrigger>
            </TabsList>
            <TabsContent value="articles" className="mt-4 flex-1">
              <div className="mb-4 flex gap-3">
                <div className="relative max-w-sm flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar artigos..."
                    className="pl-9"
                  />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-40" aria-label="Filtrar por categoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-4 overflow-y-auto pb-6 md:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {filteredArticles.map((article) => (
                    <motion.div
                      key={article.id}
                      layout
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                    >
                      <Card className="group h-full border-border/30 bg-card/50 transition-all hover:border-secondary/30">
                        <CardContent className="p-4">
                          <div className="mb-2 flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              {statusIcon(article.embedding_status)}
                              <Badge variant="outline" className="text-3xs">
                                {CATEGORY_LABELS[article.category] || article.category}
                              </Badge>
                            </div>
                            <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                aria-label={`Editar artigo: ${article.title}`}
                                onClick={() => openEdit(article)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                aria-label={`Excluir artigo: ${article.title}`}
                                onClick={() => deleteArticle(article.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <h2 className="mb-1 text-sm font-semibold text-foreground">
                            {article.title}
                          </h2>
                          <p className="mb-3 line-clamp-3 text-xs text-muted-foreground">
                            {article.content}
                          </p>
                          <div className="flex flex-wrap items-center gap-1">
                            {article.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="secondary" className="h-4 text-3xs">
                                {tag}
                              </Badge>
                            ))}
                            {!article.is_published && (
                              <Badge
                                variant="outline"
                                className="h-4 border-warning/30 text-3xs text-warning"
                              >
                                Rascunho
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </TabsContent>
            <TabsContent value="files" className="mt-4">
              <div className="space-y-2 pb-6">
                {files.map((file) => (
                  <Card key={file.id} className="border-border/30 bg-card/50">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : 'N/A'} •{' '}
                          {new Date(file.created_at).toLocaleDateString('pt-BR')}
                        </p>
                        {file.processing_status === 'failed' && (
                          <p role="status" className="mt-0.5 text-xs text-destructive">
                            {MOTIVO_FALHA}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {statusIcon(file.processing_status)}
                        <Badge variant="outline" className="text-3xs">
                          {file.processing_status}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-secondary"
                          aria-label={`Reprocessar arquivo: ${file.file_name}`}
                          aria-busy={reprocessingIds.has(file.id) ? 'true' : undefined}
                          disabled={
                            file.processing_status === 'processing' || reprocessingIds.has(file.id)
                          }
                          onClick={() => handleReprocessFile(file.id, file.processing_status)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Reprocessar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          aria-label={`Excluir arquivo: ${file.file_name}`}
                          aria-busy={deletingIds.has(file.id) ? 'true' : undefined}
                          disabled={deletingIds.has(file.id)}
                          onClick={(e) => openDeleteDialog(file, e.currentTarget)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {files.length === 0 && (
                  <div className="py-12 text-center text-muted-foreground">
                    <Upload className="mx-auto mb-3 h-10 w-10 opacity-30" />
                    <p className="text-sm">Nenhum arquivo enviado</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent aria-describedby={undefined} size="xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Artigo' : 'Novo Artigo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Título do artigo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger aria-label="Categoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tags (separadas por vírgula)</Label>
                <Input
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="tag1, tag2"
                />
              </div>
            </div>
            <div>
              <Label>Conteúdo *</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={12}
                placeholder="Escreva o conteúdo do artigo..."
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>{editingId ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir arquivo é destrutivo: o clique na linha só abre este diálogo. */}
      <AlertDialog
        open={fileToDelete !== null}
        onOpenChange={(next) => {
          if (!next) setFileToDelete(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // Devolve o foco ao botão de origem (Radix desmonta o conteúdo e, sem
            // isso, o foco cairia no `body`).
            event.preventDefault();
            const origem = deleteOriginRef.current;
            if (origem && origem.isConnected) origem.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir arquivo da base?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo <strong>{fileToDelete?.name}</strong> sai da base de conhecimento e o objeto
              correspondente é removido do armazenamento. Não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmDeleteFile}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
