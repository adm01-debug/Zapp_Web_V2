import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';
import { Plus, Trash2, Play, Loader2, Users, Mic } from 'lucide-react';

const VOICES = [
  { id: 'TY3h8ANhQUsJaa0Bga5F', name: 'Voz Principal (F)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (F)' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (M)' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (F)' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (M)' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (F)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (M)' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica (F)' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric (M)' },
];

interface ScriptLine {
  id: string;
  voice_id: string;
  text: string;
}

export function ElevenLabsDialogue() {
  const [lines, setLines] = useState<ScriptLine[]>([
    { id: crypto.randomUUID(), voice_id: VOICES[0].id, text: '' },
    { id: crypto.randomUUID(), voice_id: VOICES[1].id, text: '' },
  ]);
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const addLine = () => {
    setLines(l => [...l, { id: crypto.randomUUID(), voice_id: VOICES[0].id, text: '' }]);
  };

  const removeLine = (id: string) => {
    setLines(l => l.filter(line => line.id !== id));
  };

  const updateLine = (id: string, field: 'voice_id' | 'text', value: string) => {
    setLines(l => l.map(line => line.id === id ? { ...line, [field]: value } : line));
  };

  const generateDialogue = async () => {
    const validLines = lines.filter(l => l.text.trim());
    if (validLines.length < 2) {
      toast.error('Adicione pelo menos 2 falas com texto');
      return;
    }

    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/elevenlabs-dialogue`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            script: validLines.map(l => ({ voice_id: l.voice_id, text: l.text })),
            languageCode: 'pt',
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${response.status}`);
      }

      const blob = await response.blob();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      toast.success('Diálogo gerado com sucesso!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar diálogo');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Diálogo Multi-Personagem
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Crie conversas realistas com múltiplas vozes usando ElevenLabs
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3 pr-2">
            {lines.map((line, idx) => (
              <div key={line.id} className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono mt-2 w-6">
                  {idx + 1}
                </div>
                <div className="flex-1 space-y-2">
                  <Select value={line.voice_id} onValueChange={v => updateLine(line.id, 'voice_id', v)}>
                    <SelectTrigger className="h-8 text-xs w-44">
                      <Mic className="w-3 h-3 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOICES.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={line.text}
                    onChange={e => updateLine(line.id, 'text', e.target.value)}
                    placeholder="Digite a fala do personagem..."
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>
                {lines.length > 2 && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 mt-1 text-muted-foreground hover:text-destructive" onClick={() => removeLine(line.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={addLine} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Adicionar Fala
          </Button>
          <Button size="sm" onClick={generateDialogue} disabled={generating} className="gap-1.5">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Gerar Diálogo
          </Button>
        </div>

        {audioUrl && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <Label className="text-xs text-muted-foreground mb-2 block">Áudio Gerado</Label>
            <audio ref={audioRef} src={audioUrl} controls className="w-full h-10" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
