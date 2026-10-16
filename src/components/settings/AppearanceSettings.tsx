import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Palette, RefreshCw, GraduationCap, LayoutGrid, Save, Loader2, AlertCircle } from 'lucide-react';
import { AvatarUpload } from '@/components/settings/AvatarUpload';
import { motion } from '@/components/ui/motion';
import { useDensity, type DensityMode } from '@/hooks/ui/useDensity';
import { normalizeLanguage } from '@/i18n';

interface AppearanceSettingsProps {
  settings: {
    theme: string;
    language: string;
    compact_mode: boolean;
  };
  updateSettings: (updates: Partial<AppearanceSettingsProps['settings']>) => void;
  onResetOnboarding: () => void;
  /** `isSaving`/`onSave` vêm do hook canônico (`useUserSettings`) na SettingsView: um só dono da escrita. */
  isSaving: boolean;
  onSave: () => Promise<boolean> | void;
}

/** Valores que o dono da preferência (`useTheme`) entende; qualquer outro cai em 'system'. */
const TEMA_VALORES = ['light', 'dark', 'system'];

/**
 * O <Select> trabalha com o código do i18n (`pt|en|es`, os idiomas que existem em `resources`)
 * e grava na coluna o código que ela já usa (`pt-BR|en-US|es`), para o valor exibido nunca
 * ficar vazio e o valor salvo nunca divergir do que está em vigor.
 */
const IDIOMAS = [
  { code: 'pt', db: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en', db: 'en-US', label: 'English (US)' },
  { code: 'es', db: 'es', label: 'Español' },
];
function DensitySelector() {
  const { density, setDensity } = useDensity();
  const options: { value: DensityMode; label: string; desc: string }[] = [
    { value: 'comfortable', label: 'Confortável', desc: 'Espaçamento padrão' },
    { value: 'compact', label: 'Compacto', desc: 'Mais conteúdo visível' },
    { value: 'dense', label: 'Denso', desc: 'Máxima densidade' },
  ];
  return (
    <Select value={density} onValueChange={(v) => setDensity(v as DensityMode)}>
      <SelectTrigger aria-label="Densidade da interface"><SelectValue /></SelectTrigger>
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

export function AppearanceSettings({ settings, updateSettings, onResetOnboarding, isSaving, onSave }: AppearanceSettingsProps) {
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
  // O que a tela mostra é o valor em vigor (normalizado como o hook faz na leitura),
  // nunca um vazio por causa de um valor legado vindo do banco.
  const temaAtual = TEMA_VALORES.includes(settings.theme) ? settings.theme : 'system';
  const idiomaAtual = normalizeLanguage(settings.language);

  const handleSave = async () => {
    setErroAoSalvar(null);
    const ok = await onSave();
    if (ok === false) setErroAoSalvar('Não foi possível salvar suas preferências. Tente novamente.');
  };

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
            <Select value={temaAtual} onValueChange={(value) => updateSettings({ theme: value })}>
              <SelectTrigger aria-label="Tema"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Escuro</SelectItem>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Idioma</Label>
            <Select
              value={idiomaAtual}
              onValueChange={(code) => updateSettings({ language: IDIOMAS.find((i) => i.code === code)?.db ?? code })}
            >
              <SelectTrigger aria-label="Idioma"><SelectValue /></SelectTrigger>
              <SelectContent>
                {IDIOMAS.map((i) => (
                  <SelectItem key={i.code} value={i.code}>{i.label}</SelectItem>
                ))}
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

          {/* Botão honesto: grava só as preferências desta aba (tema, idioma e voz) no hook
              canônico. Antes ele vivia no cabeçalho global da SettingsView, onde prometia
              salvar também as abas de operação que gravam por conta própria. */}
          <div className="pt-4 border-t border-border space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Tema e idioma já valem nesta sessão; salvar mantém a escolha na sua conta.
              </p>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2" aria-label="Salvar preferências">
                {isSaving
                  ? <><Loader2 className="w-4 h-4 motion-safe:animate-spin" /> Salvando...</>
                  : <><Save className="w-4 h-4" /> Salvar preferências</>}
              </Button>
            </div>
            {erroAoSalvar && (
              <p role="alert" data-testid="appearance-save-error" className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" /> {erroAoSalvar}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
