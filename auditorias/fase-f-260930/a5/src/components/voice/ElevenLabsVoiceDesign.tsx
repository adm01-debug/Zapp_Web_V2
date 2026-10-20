import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';
import { Wand2, Loader2, Play } from 'lucide-react';

export function ElevenLabsVoiceDesign() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gender, setGender] = useState('female');
  const [age, setAge] = useState('young');
  const [accent, setAccent] = useState('brazilian');
  const [previewText, setPreviewText] = useState('Olá! Essa é a minha voz personalizada.');
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const generateVoice = async () => {
    if (!name.trim()) {
      toast.error('Dê um nome para a voz');
      return;
    }

    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/elevenlabs-voice-design`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            action: 'generate',
            name,
            description: `${description}. Gender: ${gender}, age: ${age}, accent: ${accent}`,
            text: previewText,
            gender,
            age,
            accent,
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${response.status}`);
      }

      const data = await response.json();
      if (data.audioContent) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = `data:audio/mpeg;base64,${data.audioContent}`;
        setAudioUrl(url);
      }
      toast.success('Voz gerada com sucesso!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar voz');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-primary" />
          Criar Voz Personalizada
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Descreva as características e gere uma voz personalizada via ElevenLabs
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Nome da voz</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Atendente Virtual" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Voz suave e profissional" className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Gênero</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Feminino</SelectItem>
                <SelectItem value="male">Masculino</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Idade</Label>
            <Select value={age} onValueChange={setAge}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="young">Jovem</SelectItem>
                <SelectItem value="middle_aged">Meia-idade</SelectItem>
                <SelectItem value="old">Idoso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sotaque</Label>
            <Select value={accent} onValueChange={setAccent}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="brazilian">Brasileiro</SelectItem>
                <SelectItem value="american">Americano</SelectItem>
                <SelectItem value="british">Britânico</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Texto de preview</Label>
          <Textarea
            value={previewText}
            onChange={e => setPreviewText(e.target.value)}
            rows={2}
            className="mt-1 text-sm resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={generateVoice} disabled={generating} className="gap-1.5">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Gerar Voz
          </Button>
        </div>

        {audioUrl && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <Label className="text-xs text-muted-foreground mb-2 block">Preview da Voz</Label>
            <audio src={audioUrl} controls className="w-full h-10" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
