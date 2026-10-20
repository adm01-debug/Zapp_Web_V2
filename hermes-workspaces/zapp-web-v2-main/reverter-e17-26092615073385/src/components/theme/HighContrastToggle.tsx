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

interface HighContrastContextType {
  isHighContrast: boolean;
  toggleHighContrast: () => void;
  contrastLevel: number;
  setContrastLevel: (level: number) => void;
  reducedMotion: boolean;
  toggleReducedMotion: () => void;
  largeText: boolean;
  toggleLargeText: () => void;
}

const HighContrastContext = createContext<HighContrastContextType | null>(null);

export function HighContrastProvider({ children }: { children: React.ReactNode }) {
  const [isHighContrast, setIsHighContrast] = useState(() => 
    localStorage.getItem('highContrast') === 'true'
  );
  const [contrastLevel, setContrastLevel] = useState(() =>
    parseInt(localStorage.getItem('contrastLevel') || '100')
  );
  const [reducedMotion, setReducedMotion] = useState(() =>
    localStorage.getItem('reducedMotion') === 'true'
  );
  const [largeText, setLargeText] = useState(() =>
    localStorage.getItem('largeText') === 'true'
  );

  useEffect(() => {
    const root = document.documentElement;
    
    if (isHighContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    localStorage.setItem('highContrast', String(isHighContrast));
  }, [isHighContrast]);

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
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Configurações de acessibilidade">
          <Contrast className="h-5 w-5" />
        </Button>
      </DialogTrigger>
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
