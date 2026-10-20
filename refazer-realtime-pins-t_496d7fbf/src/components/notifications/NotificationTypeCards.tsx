import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Bell, Volume2, VolumeX, Play, Moon,
  AlertTriangle, MessageSquare, AtSign, RotateCcw,
  CheckCircle2, TrendingDown, Activity, Mic,
} from 'lucide-react';
import { NotificationSettings, SoundTypeOption } from '@/hooks/system/useNotificationSettings';
import { playNotificationSound, SoundType, NotificationType } from '@/utils/notificationSounds';
import { cn } from '@/lib/utils';

const SOUND_TYPES: { value: SoundTypeOption; label: string; description: string }[] = [
  { value: 'chime', label: 'Chime', description: 'Tom suave e harmonioso' },
  { value: 'beep', label: 'Beep', description: 'Som eletrônico clássico' },
  { value: 'bell', label: 'Sino', description: 'Som de campainha' },
  { value: 'alert', label: 'Alerta', description: 'Som mais chamativo' },
  { value: 'soft', label: 'Suave', description: 'Notificação discreta' },
];

interface SoundSelectorProps {
  value: SoundTypeOption;
  onChange: (value: SoundTypeOption) => void;
  notificationType: NotificationType;
  label: string;
  soundVolume: number;
}

export function SoundSelector({ value, onChange, notificationType, label, soundVolume }: SoundSelectorProps) {
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = () => {
    setIsTesting(true);
    playNotificationSound(notificationType, value as SoundType, soundVolume);
    setTimeout(() => setIsTesting(false), 1000);
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={(v: SoundTypeOption) => onChange(v)}>
        <SelectTrigger className="w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SOUND_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" onClick={handleTest} disabled={isTesting} className="h-8 w-8">
        <Play className={cn("w-3 h-3", isTesting && "animate-pulse text-primary")} />
      </Button>
    </div>
  );
}

interface NotificationTypeSectionProps {
  settings: NotificationSettings;
  updateSettings: (partial: Partial<NotificationSettings>) => void;
}

export function NotificationTypeSection({ settings, updateSettings }: NotificationTypeSectionProps) {
  return (
    <Card className="border-secondary/20 bg-card">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-info/15 flex items-center justify-center">
            <Bell className="w-5 h-5 text-info" />
          </div>
          <div>
            <CardTitle className="text-lg">Tipos de Notificação</CardTitle>
            <CardDescription>Escolha quais eventos devem notificar</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <NotifRow icon={MessageSquare} iconColor="text-success" title="Novas Mensagens" desc="Receber quando chegar nova mensagem"
          enabled={settings.newMessageSound} onToggle={(c) => updateSettings({ newMessageSound: c })}
          soundSelector={settings.newMessageSound && settings.soundEnabled ? (
            <SoundSelector value={settings.messageSoundType} onChange={(v) => updateSettings({ messageSoundType: v })} notificationType="message" label="Som" soundVolume={settings.soundVolume} />
          ) : undefined}
        />
        <Separator />
        <NotifRow icon={AtSign} iconColor="text-secondary" title="Menções" desc="Quando alguém mencionar você"
          enabled={settings.mentionSound} onToggle={(c) => updateSettings({ mentionSound: c })}
          soundSelector={settings.mentionSound && settings.soundEnabled ? (
            <SoundSelector value={settings.mentionSoundType} onChange={(v) => updateSettings({ mentionSoundType: v })} notificationType="mention" label="Som" soundVolume={settings.soundVolume} />
          ) : undefined}
        />
        <Separator />
        <NotifRow icon={AlertTriangle} iconColor="text-destructive" title="Violação de SLA" desc="Alerta quando SLA for violado"
          enabled={settings.slaBreachSound} onToggle={(c) => updateSettings({ slaBreachSound: c })}
          soundSelector={settings.slaBreachSound && settings.soundEnabled ? (
            <SoundSelector value={settings.slaSoundType} onChange={(v) => updateSettings({ slaSoundType: v })} notificationType="sla_breach" label="Som" soundVolume={settings.soundVolume} />
          ) : undefined}
        />
        <Separator />
        <NotifRow icon={CheckCircle2} iconColor="text-success" title="Metas Alcançadas" desc="Quando uma meta for atingida"
          soundSelector={settings.soundEnabled ? (
            <SoundSelector value={settings.goalSoundType} onChange={(v) => updateSettings({ goalSoundType: v })} notificationType="goal_achieved" label="Som" soundVolume={settings.soundVolume} />
          ) : undefined}
        />
        <Separator />
        <NotifRow icon={Mic} iconColor="text-primary" title="Transcrição de Áudio" desc="Quando áudio for transcrito automaticamente"
          enabled={settings.transcriptionNotificationEnabled} onToggle={(c) => updateSettings({ transcriptionNotificationEnabled: c })}
          soundSelector={settings.transcriptionNotificationEnabled && settings.soundEnabled ? (
            <SoundSelector value={settings.transcriptionSoundType} onChange={(v) => updateSettings({ transcriptionSoundType: v })} notificationType="achievement" label="Som" soundVolume={settings.soundVolume} />
          ) : undefined}
        />
      </CardContent>
    </Card>
  );
}

function NotifRow({ icon: Icon, iconColor, title, desc, enabled, onToggle, soundSelector }: {
  icon: React.ElementType; iconColor: string; title: string; desc: string;
  enabled?: boolean; onToggle?: (checked: boolean) => void; soundSelector?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <Icon className={cn("w-5 h-5", iconColor)} />
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {soundSelector}
        {onToggle && <Switch checked={enabled} onCheckedChange={onToggle} />}
      </div>
    </div>
  );
}

interface SentimentAlertCardProps {
  settings: NotificationSettings;
  updateSettings: (partial: Partial<NotificationSettings>) => void;
}

export function SentimentAlertCard({ settings, updateSettings }: SentimentAlertCardProps) {
  return (
    <Card className="border-secondary/20 bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/15 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-warning" />
            </div>
            <div>
              <CardTitle className="text-lg">Alertas de Sentimento</CardTitle>
              <CardDescription>Notificações quando clientes ficam insatisfeitos</CardDescription>
            </div>
          </div>
          <Switch
            checked={settings.sentimentAlertEnabled}
            onCheckedChange={(checked) => updateSettings({ sentimentAlertEnabled: checked })}
          />
        </div>
      </CardHeader>
      {settings.sentimentAlertEnabled && (
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Limite de Alerta</Label>
              <Badge variant="outline" className={cn(
                "font-mono",
                settings.sentimentAlertThreshold < 30 ? "text-destructive border-destructive/50" :
                settings.sentimentAlertThreshold < 50 ? "text-warning border-warning/50" :
                "text-warning border-yellow-400/50"
              )}>
                {settings.sentimentAlertThreshold}%
              </Badge>
            </div>
            <Slider
              value={[settings.sentimentAlertThreshold]}
              onValueChange={([value]) => updateSettings({ sentimentAlertThreshold: value })}
              min={10} max={60} step={5}
            />
            <p className="text-xs text-muted-foreground">
              Alerta quando o sentimento cair abaixo de {settings.sentimentAlertThreshold}%
            </p>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Análises Consecutivas</Label>
              <Badge variant="secondary" className="font-mono">{settings.sentimentConsecutiveCount}x</Badge>
            </div>
            <div className="flex items-center gap-2">
              {[2, 3, 4, 5].map((count) => (
                <Button key={count} variant={settings.sentimentConsecutiveCount === count ? "default" : "outline"}
                  size="sm" className="flex-1" onClick={() => updateSettings({ sentimentConsecutiveCount: count })}>
                  {count}x
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Alerta apenas após {settings.sentimentConsecutiveCount} análises negativas consecutivas
            </p>
          </div>
          <Separator />
          <div className="bg-muted/30 rounded-lg p-3 flex items-start gap-3">
            <Activity className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Como funciona?</p>
              <p className="text-muted-foreground text-xs mt-1">
                O sistema analisa conversas automaticamente. Quando o sentimento do cliente fica
                abaixo de {settings.sentimentAlertThreshold}% por {settings.sentimentConsecutiveCount} análises
                consecutivas, você recebe um alerta por notificação e email (se configurado).
              </p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

interface QuietHoursCardProps {
  settings: NotificationSettings;
  updateSettings: (partial: Partial<NotificationSettings>) => void;
  isQuietHours: () => boolean;
}

export function QuietHoursCard({ settings, updateSettings, isQuietHours }: QuietHoursCardProps) {
  return (
    <Card className="border-secondary/20 bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Moon className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Horário Silencioso</CardTitle>
              <CardDescription>Desativar sons em horários específicos</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isQuietHours() && <Badge variant="secondary" className="bg-muted">Ativo agora</Badge>}
            <Switch checked={settings.quietHoursEnabled} onCheckedChange={(checked) => updateSettings({ quietHoursEnabled: checked })} />
          </div>
        </div>
      </CardHeader>
      {settings.quietHoursEnabled && (
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Label className="text-sm">Início</Label>
              <Input type="time" value={settings.quietHoursStart} onChange={(e) => updateSettings({ quietHoursStart: e.target.value })} />
            </div>
            <div className="flex-1 space-y-2">
              <Label className="text-sm">Fim</Label>
              <Input type="time" value={settings.quietHoursEnd} onChange={(e) => updateSettings({ quietHoursEnd: e.target.value })} />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
