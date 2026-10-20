import { useState } from 'react';
import type { ElementType } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Volume2, VolumeX, Bell, MessageSquare, AlertTriangle, Trophy, Clock, Moon, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { SoundCategoryCard } from './SoundCategoryCard';
import {
  useNotificationSettings,
  type NotificationSettings,
  type SoundTypeOption,
} from '@/hooks/system/useNotificationSettings';
import { previewSound } from '@/utils/notificationSounds';

/**
 * A aba Sons lê E grava pelo MESMO hook que os alertas usam
 * (`useNotificationSettings` — useRealtimeNotifications, useSLANotifications,
 * useGoalNotifications, useTranscriptionNotifications, useSentimentAlerts e o
 * controle rápido SoundVolumeControl). Antes o painel instanciava um
 * `useUserSettings()` próprio, nunca salvava, e o "Salvar Alterações" do
 * SettingsView gravava outra cópia: a tela confirmava o que os alertas nunca
 * aplicavam.
 */

/** Vocabulário FECHADO: o mesmo do banco (CHECK `user_settings_*_sound_type_valid`) e do player. */
const CANONICAL_SOUNDS: { id: SoundTypeOption; name: string; description: string }[] = [
  { id: 'beep', name: 'Beep', description: 'Som eletrônico clássico' },
  { id: 'chime', name: 'Chime', description: 'Tom suave e harmonioso' },
  { id: 'bell', name: 'Sino', description: 'Som de campainha' },
  { id: 'alert', name: 'Alerta', description: 'Som mais chamativo' },
  { id: 'soft', name: 'Suave', description: 'Notificação discreta' },
];

const CANONICAL_SOUND_IDS: string[] = CANONICAL_SOUNDS.map((s) => s.id);

type CategoryKey = 'message' | 'mention' | 'sla' | 'goal' | 'transcription';

/** Campo do hook canônico para cada categoria da tela (antes: `settings[`${cat}_sound_type`] as any`). */
type SoundField =
  | 'messageSoundType'
  | 'mentionSoundType'
  | 'slaSoundType'
  | 'goalSoundType'
  | 'transcriptionSoundType';

const CATEGORY_SOUND_FIELD: Record<CategoryKey, SoundField> = {
  message: 'messageSoundType',
  mention: 'mentionSoundType',
  sla: 'slaSoundType',
  goal: 'goalSoundType',
  transcription: 'transcriptionSoundType',
};

interface CategoryConfig {
  label: string;
  icon: ElementType;
  description: string;
}

const SOUND_CATEGORIES: Record<CategoryKey, CategoryConfig> = {
  message: { label: 'Mensagens', icon: MessageSquare, description: 'Som para novas mensagens recebidas' },
  mention: { label: 'Menções', icon: Bell, description: 'Som quando você é mencionado' },
  sla: { label: 'SLA', icon: AlertTriangle, description: 'Alertas de SLA próximo de vencer' },
  goal: { label: 'Metas', icon: Trophy, description: 'Celebração ao atingir metas' },
  transcription: { label: 'Transcrição', icon: Clock, description: 'Quando uma transcrição é concluída' },
};

const temProprio = (obj: object, chave: string) => Object.prototype.hasOwnProperty.call(obj, chave);

const isCategoryKey = (valor: string): valor is CategoryKey => temProprio(CATEGORY_SOUND_FIELD, valor);

/** O que sai da tela para o banco: só o vocabulário canônico (nada de 'default', 'pop', 'none'). */
const isSoundType = (valor: string): valor is SoundTypeOption =>
  CANONICAL_SOUND_IDS.includes(valor);

export function SoundCustomizationPanel() {
  const { settings, updateSettings } = useNotificationSettings();
  const [playingSound, setPlayingSound] = useState<string | null>(null);
  // Guardado só para mostrar que o arquivo foi ENVIADO — enviado não é aplicado.
  const [uploadedSoundPath, setUploadedSoundPath] = useState<string | null>(null);

  /** Toca o som REAL (`previewSound`), no volume REAL dos alertas. Silêncio é o global. */
  const playPreview = (categoria: string, soundId: SoundTypeOption) => {
    if (!settings.soundEnabled) return;
    previewSound(soundId, settings.soundVolume);
    setPlayingSound(`${categoria}-${soundId}`);
    setTimeout(() => setPlayingSound(null), 500);
  };

  /** Mapeia a categoria da tela para o campo do hook canônico e grava nele. */
  const aplicarSom = (category: CategoryKey, soundId: SoundTypeOption) => {
    const campo = CATEGORY_SOUND_FIELD[category];
    const alteracao: Partial<NotificationSettings> = {};
    alteracao[campo] = soundId;
    updateSettings(alteracao);
  };

  const handleSoundChange = (category: string, soundId: string) => {
    if (!isCategoryKey(category) || !isSoundType(soundId)) return;
    // Grava na hora, no hook canônico: o alerta passa a tocar o som novo sem depender de "Salvar".
    aplicarSom(category, soundId);
    playPreview(category, soundId);
  };

  const handlePlayPreview = (category: string, soundId: string) => {
    if (!isSoundType(soundId)) return;
    playPreview(category, soundId);
  };

  const getSoundValue = (category: CategoryKey): SoundTypeOption => settings[CATEGORY_SOUND_FIELD[category]];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo: 2MB'); return; }
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.storage.from('audio-messages').upload(`custom-sounds/${Date.now()}-${file.name}`, file);
      if (error) throw error;
      // Guarda o caminho devolvido pelo storage para não se perder. O arquivo é enviado,
      // NÃO vira preferência: os alertas tocam os 5 tipos do player (SOUND_CONFIGS).
      setUploadedSoundPath(data?.path ?? null);
      toast.success('Arquivo enviado.');
    } catch { setUploadedSoundPath(null); toast.error('Erro ao fazer upload do som'); }
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg"><Volume2 className="w-5 h-5 text-primary" />Controles Gerais</CardTitle>
          <CardDescription>Configure o som geral da plataforma</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.soundEnabled ? <Volume2 className="w-5 h-5 text-primary" /> : <VolumeX className="w-5 h-5 text-muted-foreground" />}
              <div><Label className="text-base">Sons habilitados</Label><p className="text-sm text-muted-foreground">Ativa ou desativa todos os sons</p></div>
            </div>
            <Switch aria-label="Sons habilitados" checked={settings.soundEnabled} onCheckedChange={(checked) => updateSettings({ soundEnabled: checked })} />
          </div>
          <AnimatePresence>
            {settings.soundEnabled && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3">
                <div className="flex items-center justify-between"><Label>Volume geral</Label><Badge variant="secondary">{settings.soundVolume}%</Badge></div>
                <Slider value={[settings.soundVolume]} onValueChange={([v]) => updateSettings({ soundVolume: v })} min={10} max={100} step={5} thumbLabel="Volume geral" className="w-full" />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3"><Moon className="w-5 h-5 text-primary" /><div><Label className="text-base">Horário silencioso</Label><p className="text-sm text-muted-foreground">Silenciar sons em determinados horários</p></div></div>
              <Switch aria-label="Horário silencioso" checked={settings.quietHoursEnabled} onCheckedChange={(checked) => updateSettings({ quietHoursEnabled: checked })} />
            </div>
            <AnimatePresence>
              {settings.quietHoursEnabled && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Início</Label><input type="time" aria-label="Início do horário silencioso" value={settings.quietHoursStart || '22:00'} onChange={(e) => updateSettings({ quietHoursStart: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
                  <div className="space-y-2"><Label>Término</Label><input type="time" aria-label="Término do horário silencioso" value={settings.quietHoursEnd || '08:00'} onChange={(e) => updateSettings({ quietHoursEnd: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {(Object.entries(SOUND_CATEGORIES) as [CategoryKey, CategoryConfig][]).map(([key, cat]) => (
          <SoundCategoryCard key={key} categoryKey={key} label={cat.label} description={cat.description} icon={cat.icon} sounds={CANONICAL_SOUNDS} currentSound={getSoundValue(key)} isPlaying={!!playingSound?.startsWith(`${key}-`)} disabled={!settings.soundEnabled} onSoundChange={handleSoundChange} onPlayPreview={handlePlayPreview} />
        ))}
      </div>

      <Card className="border-dashed border-2">
        <CardContent className="p-6 text-center">
          <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h4 className="font-medium mb-1">Sons Personalizados</h4>
          <p className="text-sm text-muted-foreground mb-4">Upload (.mp3, .wav, .ogg) — Máximo 2MB</p>
          <input type="file" accept="audio/mp3,audio/wav,audio/ogg,audio/mpeg" className="hidden" id="custom-sound-upload" onChange={handleUpload} />
          <Button variant="outline" onClick={() => document.getElementById('custom-sound-upload')?.click()}><Upload className="w-4 h-4 mr-2" />Fazer Upload</Button>
          {uploadedSoundPath && (
            <p data-testid="custom-sound-status" role="status" className="text-xs text-muted-foreground mt-4">
              Arquivo <strong>enviado</strong> ({uploadedSoundPath}) e guardado — mas ainda <strong>NÃO é aplicado aos alertas</strong>.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
