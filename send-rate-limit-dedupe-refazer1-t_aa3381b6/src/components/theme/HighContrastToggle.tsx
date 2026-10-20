import { useState, useEffect, createContext, useContext, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Contrast } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
// O `TooltipProvider` LOCAL é o que faz o botão de acessibilidade se bastar quando o
// componente é montado FORA do `AppProviders` (testes, pré-visualização de tela): sem um
// provider ancestral, o Radix lança `Tooltip must be used within TooltipProvider` e a tela
// inteira que renderiza este botão morre. Aninhar provider é o mesmo padrão já usado em
// `src/components/email/EmailChatBubble.tsx` e `EmailChatThread.tsx`.
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { applyThemePreset, loadThemeConfig } from '@/components/settings/theme/presets';

interface HighContrastContextType {
  isHighContrast: boolean;
  toggleHighContrast: () => void;
  contrastLevel: number;
  setContrastLevel: (level: number) => void;
  /** Preferência do usuário para movimento reduzido — FONTE ÚNICA também lida pelas
   *  transições de rota (`useTransitionPreferences`); ver R2-INF-037. */
  reducedMotion: boolean;
  toggleReducedMotion: () => void;
  /** Escrita explícita da MESMA preferência (o controle usa `toggleReducedMotion`). */
  setReducedMotion: (value: boolean) => void;
  largeText: boolean;
  toggleLargeText: () => void;
}

const HighContrastContext = createContext<HighContrastContextType | null>(null);

/** Le a preferencia de contraste do sistema com seguranca (jsdom/SSR nao tem `matchMedia`).
 *  NAO e exportada de proposito: este arquivo exporta componentes e exportar uma funcao daqui
 *  quebra o fast refresh (react-refresh/only-export-components, apontado pelo lint ratchet). */
function preferenciaDoSistemaPorMaisContraste(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-contrast: more)').matches;
  } catch {
    return false;
  }
}

export function HighContrastProvider({ children }: { children: React.ReactNode }) {
  const [isHighContrast, setIsHighContrast] = useState(() => 
    localStorage.getItem('highContrast') === 'true'
  );
  const [contrastLevel, setContrastLevel] = useState(() =>
    Number.parseInt(localStorage.getItem('contrastLevel') || '100')
  );
  const [reducedMotion, setReducedMotion] = useState(() =>
    localStorage.getItem('reducedMotion') === 'true'
  );
  const [largeText, setLargeText] = useState(() =>
    localStorage.getItem('largeText') === 'true'
  );

  /**
   * O sistema operacional pede mais contraste? O CSS tem `@media (prefers-contrast: more)`, mas ela
   * e INERTE aqui: o preset escreve as cores *inline* no `<html>` (`presets.ts` — `style.setProperty`)
   * e variavel inline vence qualquer regra de folha de estilo. Medido em producao em 03/10:
   * emulando `prefers-contrast: more`, o `matchMedia` casa mas `--border` nao muda de valor.
   *
   * Por isso a preferencia do sistema e lida em JS e vira a MESMA classe que o toggle usa —
   * `.high-contrast`, cujo efeito e real porque o efeito logo abaixo reaplica a skin depois de mexer
   * na classe, o que limpa as vars inline que a venceriam.
   */
  const [prefereMaisContrasteNoSistema, setPrefereMaisContrasteNoSistema] = useState(
    preferenciaDoSistemaPorMaisContraste
  );
  const contrasteAtivo = isHighContrast || prefereMaisContrasteNoSistema;

  useEffect(() => {
    const root = document.documentElement;
    
    if (contrasteAtivo) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    localStorage.setItem('highContrast', String(isHighContrast));

    // Reaplica a skin depois de mexer na classe: ligar o alto contraste precisa LIMPAR as
    // vars de cor que o preset deixou inline no `<html>` (senão elas vencem a classe
    // `.high-contrast` e o modo não faz efeito); desligar precisa devolvê-las. Sem isto o
    // modo só passaria a valer na próxima troca de preset ou de modo de cor.
    const cfg = loadThemeConfig();
    applyThemePreset(cfg.preset, root.classList.contains('dark') ? 'dark' : 'light', {
      persistCache: false,
    });
  }, [contrasteAtivo, isHighContrast]);

  // Segue a preferencia do sistema enquanto a pagina estiver aberta: se o usuario ligar "mais
  // contraste" no sistema operacional (ou desligar), a classe acompanha sem precisar recarregar.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const consulta = window.matchMedia('(prefers-contrast: more)');
    const aoMudar = () => setPrefereMaisContrasteNoSistema(consulta.matches);
    aoMudar();
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--contrast-multiplier', String(contrastLevel / 100));
    localStorage.setItem('contrastLevel', String(contrastLevel));
  }, [contrastLevel]);

  useEffect(() => {
    if (reducedMotion) {
      document.documentElement.classList.add('reduced-motion');
    } else {
      document.documentElement.classList.remove('reduced-motion');
    }
    localStorage.setItem('reducedMotion', String(reducedMotion));
  }, [reducedMotion]);

  useEffect(() => {
    if (largeText) {
      document.documentElement.classList.add('large-text');
    } else {
      document.documentElement.classList.remove('large-text');
    }
    localStorage.setItem('largeText', String(largeText));
  }, [largeText]);

  const toggleHighContrast = () => setIsHighContrast(prev => !prev);
  const toggleReducedMotion = () => setReducedMotion(prev => !prev);
  const toggleLargeText = () => setLargeText(prev => !prev);

  return (
    <HighContrastContext.Provider
      value={{
        isHighContrast,
        toggleHighContrast,
        contrastLevel,
        setContrastLevel,
        reducedMotion,
        toggleReducedMotion,
        setReducedMotion,
        largeText,
        toggleLargeText,
      }}
    >
      {children}
    </HighContrastContext.Provider>
  );
}

export function useHighContrast() {
  const context = useContext(HighContrastContext);
  if (!context) {
    throw new Error('useHighContrast must be used within HighContrastProvider');
  }
  return context;
}

export function HighContrastToggle() {
  const { isHighContrast, toggleHighContrast } = useHighContrast();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleHighContrast}
      aria-label={isHighContrast ? 'Desativar alto contraste' : 'Ativar alto contraste'}
    >
      {isHighContrast ? (
        <Eye className="h-5 w-5" />
      ) : (
        <EyeOff className="h-5 w-5" />
      )}
    </Button>
  );
}

export const AccessibilitySettings = forwardRef<HTMLDivElement>((_, ref) => {
  const {
    isHighContrast,
    toggleHighContrast,
    contrastLevel,
    setContrastLevel,
    reducedMotion,
    toggleReducedMotion,
    largeText,
    toggleLargeText,
  } = useHighContrast();

  return (
    <Dialog>
      {/* S27 (B3): a dica segue o MESMO padrão do botão de tema vizinho na sidebar
          (Sidebar.tsx): delayDuration 200, `side="right"` + `sideOffset={8}` para a dica
          caber à direita com a sidebar recolhida. O `aria-label` abaixo não muda. */}
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Configurações de acessibilidade">
                <Contrast className="h-5 w-5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="text-xs">
            Acessibilidade — alto contraste, menos movimento, texto grande
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent aria-describedby={undefined} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Contrast className="h-5 w-5" />
            Acessibilidade
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* High Contrast */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="high-contrast">Alto Contraste</Label>
                  <p className="text-sm text-muted-foreground">
                    Aumenta o contraste das cores para melhor visibilidade
                  </p>
                </div>
                <Switch
                  id="high-contrast"
                  checked={isHighContrast}
                  onCheckedChange={toggleHighContrast}
                />
              </div>
            </CardContent>
          </Card>

          {/* Contrast Level */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-0.5">
                <Label>Nível de Contraste: {contrastLevel}%</Label>
                <p className="text-sm text-muted-foreground">
                  Ajuste fino do nível de contraste
                </p>
              </div>
              <Slider
                value={[contrastLevel]}
                onValueChange={([value]) => setContrastLevel(value)}
                min={75}
                max={150}
                step={5}
              />
            </CardContent>
          </Card>

          {/* Reduced Motion */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="reduced-motion">Reduzir Movimento</Label>
                  <p className="text-sm text-muted-foreground">
                    Desativa animações para reduzir distrações
                  </p>
                </div>
                <Switch
                  id="reduced-motion"
                  checked={reducedMotion}
                  onCheckedChange={toggleReducedMotion}
                />
              </div>
            </CardContent>
          </Card>

          {/* Large Text */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="large-text">Texto Grande</Label>
                  <p className="text-sm text-muted-foreground">
                    Aumenta o tamanho da fonte em toda a aplicação
                  </p>
                </div>
                <Switch
                  id="large-text"
                  checked={largeText}
                  onCheckedChange={toggleLargeText}
                />
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <p className="text-sm font-medium mb-2">Preview:</p>
              <div className="p-3 rounded-lg bg-background border">
                <p className="text-foreground">Texto normal</p>
                <p className="text-muted-foreground text-sm">Texto secundário</p>
                <div className="flex gap-2 mt-2">
                  <Button size="sm">Botão</Button>
                  <Button size="sm" variant="outline">Outline</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
});

AccessibilitySettings.displayName = 'AccessibilitySettings';
