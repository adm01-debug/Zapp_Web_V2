import { forwardRef } from 'react';
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
import { useHighContrast } from './highContrastContext';

// Reexport do provider (componente): ele morava aqui e quem importa deste caminho segue
// funcionando. O hook `useHighContrast` NAO e reexportado — exportar funcao de arquivo de
// componente quebra o fast refresh (react-refresh/only-export-components); importe-o de
// `./highContrastContext`.
export { HighContrastProvider } from './HighContrastProvider';

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
