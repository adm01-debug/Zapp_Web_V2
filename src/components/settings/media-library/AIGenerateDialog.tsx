import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Play, Music, Volume2, RefreshCw, Check, Wand2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { getLogger } from '@/lib/logger';
const log = getLogger('AIGenerateDialog');

export function AIGenerateDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [genPrompt, setGenPrompt] = useState('');
  const [genMode, setGenMode] = useState<'sfx' | 'music'>('sfx');
  const [genDuration, setGenDuration] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [genPreviewUrl, setGenPreviewUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleGenerate = async () => {
    if (!genPrompt.trim()) return;
    setGenerating(true); setGenPreviewUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-sfx', { body: { prompt: genPrompt, duration: genDuration, mode: genMode } });
      if (error || data?.error) throw new Error(data?.error || 'Generation failed');
      if (!data?.audioContent) throw new Error('Resposta sem conteúdo de áudio');
      const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
      setGenPreviewUrl(audioUrl);
      audioRef.current?.pause();
      const audio = new Audio(audioUrl); audio.play().catch(() => {}); audioRef.current = audio;
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Erro ao gerar áudio'); } finally { setGenerating(false); }
  };

  const handleSaveGenerated = async () => {
    if (!genPreviewUrl) return;
    setGenerating(true);
    try {
      const resp = await fetch(genPreviewUrl); const blob = await resp.blob();
      const storagePath = `ai_gen_${Date.now()}_${crypto.randomUUID()}.mp3`;
      const { error: uploadError } = await supabase.storage.from('audio-memes').upload(storagePath, blob, { contentType: 'audio/mpeg', cacheControl: '31536000' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('audio-memes').getPublicUrl(storagePath);
      const { data: { user } } = await supabase.auth.getUser();
      let aiCategory = 'outros';
      try { const { data: classifyData } = await supabase.functions.invoke('classify-audio-meme', { body: { audio_url: urlData.publicUrl, file_name: genPrompt } }); if (classifyData?.category) aiCategory = classifyData.category; } catch (err) { log.error('Unexpected error in AIGenerateDialog:', err); }
      const { error: insertError } = await supabase.from('audio_memes').insert({ name: genPrompt.substring(0, 80), audio_url: urlData.publicUrl, category: aiCategory, is_favorite: false, use_count: 0, uploaded_by: user?.id || null });
      if (insertError) throw insertError;
      toast.success(`Áudio salvo como "${aiCategory}"`); onOpenChange(false); setGenPrompt(''); setGenPreviewUrl(null); onSaved();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Erro ao salvar áudio'); } finally { setGenerating(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { audioRef.current?.pause(); setGenPreviewUrl(null); } }}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" />Gerar Áudio com IA</DialogTitle>
          <DialogDescription>Descreva o efeito sonoro ou música que deseja gerar usando ElevenLabs</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button variant={genMode === 'sfx' ? 'default' : 'outline'} size="sm" onClick={() => { setGenMode('sfx'); setGenDuration(5); }} className="flex-1 gap-1.5"><Volume2 className="w-4 h-4" /> Efeito Sonoro</Button>
            <Button variant={genMode === 'music' ? 'default' : 'outline'} size="sm" onClick={() => { setGenMode('music'); setGenDuration(15); }} className="flex-1 gap-1.5"><Music className="w-4 h-4" /> Música</Button>
          </div>
          <div className="space-y-2"><Label>Descrição do áudio</Label><Textarea value={genPrompt} onChange={e => setGenPrompt(e.target.value)} placeholder={genMode === 'sfx' ? 'Ex: Risada de vilão ecoando...' : 'Ex: Música de suspense cinematográfica...'} rows={3} /></div>
          <div className="space-y-2"><Label>Duração: {genDuration}s</Label><input type="range" min={genMode === 'sfx' ? 1 : 5} max={genMode === 'sfx' ? 22 : 60} value={genDuration} onChange={e => setGenDuration(Number(e.target.value))} className="w-full accent-primary" /><div className="flex justify-between text-[10px] text-muted-foreground"><span>{genMode === 'sfx' ? '1s' : '5s'}</span><span>{genMode === 'sfx' ? '22s' : '60s'}</span></div></div>
          {genPreviewUrl && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/50">
              <Button variant="outline" size="icon" className="w-8 h-8 shrink-0" onClick={() => { audioRef.current?.pause(); const a = new Audio(genPreviewUrl); a.play().catch(() => {}); audioRef.current = a; }}><Play className="w-4 h-4" /></Button>
              <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{genPrompt}</p><p className="text-[10px] text-muted-foreground">{genDuration}s • {genMode === 'sfx' ? 'Efeito' : 'Música'}</p></div>
              <Badge className="bg-success/10 text-success border-success/20 text-[10px]">Pronto</Badge>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {!genPreviewUrl ? (
            <Button onClick={handleGenerate} disabled={generating || !genPrompt.trim()} className="gap-1.5">{generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}{generating ? 'Gerando...' : 'Gerar Preview'}</Button>
          ) : (
            <><Button variant="outline" onClick={() => setGenPreviewUrl(null)} className="gap-1.5"><RefreshCw className="w-4 h-4" /> Refazer</Button><Button onClick={handleSaveGenerated} disabled={generating} className="gap-1.5">{generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{generating ? 'Salvando...' : 'Salvar na Biblioteca'}</Button></>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
