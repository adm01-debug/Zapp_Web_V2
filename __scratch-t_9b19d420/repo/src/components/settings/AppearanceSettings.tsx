import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Palette, RefreshCw, GraduationCap, LayoutGrid } from 'lucide-react';
import { AvatarUpload } from '@/components/settings/AvatarUpload';
import { motion } from '@/components/ui/motion';
import { useDensity, type DensityMode } from '@/hooks/ui/useDensity';

interface AppearanceSettingsProps {
  settings: {
    theme: string;
    language: string;
    compact_mode: boolean;
  };
  updateSettings: (updates: Partial<AppearanceSettingsProps['settings']>) => void;
  onResetOnboarding: () => void;
}
function DensitySelector() {
  const { density, setDensity } = useDensity();
  const options: { value: DensityMode; label: string; desc: string }[] = [
    { value: 'comfortable', label: 'Confortável', desc: 'Espaçamento padrão' },
    { value: 'compact', label: 'Compacto', desc: 'Mais conteúdo visível' },
    { value: 'dense', label: 'Denso', desc: 'Máxima densidade' },
  ];
  return (
    <Select value={density} onValueChange={(v) => setDensity(v as DensityMode)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className="font-medium">{o.label}</span>
            <span className="ml-2 text-muted-foreground text-xs">— {o.desc}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AppearanceSettings({ settings, updateSettings, onResetOnboarding }: AppearanceSettingsProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-whatsapp" />
            Aparência
          </CardTitle>
          <CardDescription>Personalize a aparência da plataforma</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Foto do Perfil</Label>
            <AvatarUpload />
          </div>

          <div className="space-y-2">
            <Label>Tema</Label>
            <Select value={settings.theme} onValueChange={(value) => updateSettings({ theme: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Escuro</SelectItem>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Idioma</Label>
            <Select value={settings.language} onValueChange={(value) => updateSettings({ language: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                <SelectItem value="en-US">English (US)</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-primary" />
              Densidade da interface
            </Label>
            <p className="text-sm text-muted-foreground">Controle o espaçamento geral da UI</p>
            <DensitySelector />
          </div>

          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-whatsapp" />
                  Tour de Onboarding
                </Label>
                <p className="text-sm text-muted-foreground">Reinicie o tour guiado para conhecer todas as funcionalidades</p>
              </div>
              <Button variant="outline" onClick={onResetOnboarding} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Reiniciar Tour
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
