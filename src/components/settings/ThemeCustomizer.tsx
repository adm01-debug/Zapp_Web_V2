import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Palette, Save, Sun, Moon, Monitor, ChevronLeft, Sparkles, Gamepad2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/ui/useTheme';
import { classicPresets, gxPresets, getPresetById } from './theme/presets';
import { useThemePreset } from './theme/useThemePreset';
import { PresetCard } from './theme/PresetCard';
import { BorderRadiusControl } from './theme/BorderRadiusControl';
import { ThemeResetDialog } from './theme/ThemeResetDialog';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export function ThemeCustomizer() {
  const { theme, setTheme } = useTheme();
  const reducedMotion = useReducedMotion();
  const { config, hasUnsavedChanges, updateConfig, applyPreset, handleSave, handleReset } = useThemePreset();

  const activeName = getPresetById(config.preset)?.name ?? 'Padrão';
  const motionInitial = reducedMotion ? false : 'hidden';

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Back + Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => window.history.back()}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Palette className="w-5 h-5 text-primary" />
              Skins
              <span className="rounded-md border border-primary/30 bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                ✓ {activeName}
              </span>
            </h3>
            <p className="text-sm text-muted-foreground">Escolha sua skin favorita</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="default" size="sm" data-testid="theme-save" className="relative" onClick={handleSave}>
            <Save className="w-4 h-4 mr-1" /> Salvar
            {hasUnsavedChanges && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
            )}
          </Button>
          <ThemeResetDialog onConfirm={handleReset} />
        </div>
      </div>

      {/* Modo de Cor — inalterado */}
      <Card className="border-secondary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Modo de Cor</CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('light')}
                  >
                    <Sun className="w-4 h-4 mr-1" /> Claro
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Força o tema claro independente do sistema</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('dark')}
                  >
                    <Moon className="w-4 h-4 mr-1" /> Escuro
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Força o tema escuro independente do sistema</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={theme === 'system' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('system')}
                  >
                    <Monitor className="w-4 h-4 mr-1" /> Sistema
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Segue automaticamente a preferência do seu dispositivo</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Skins clássicas */}
      <motion.div initial={motionInitial} animate="visible" variants={fadeUp} custom={0}>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="h-4 w-4" /> Skins clássicas <span>({classicPresets.length})</span>
        </h4>
        <div
          role="radiogroup"
          aria-label="Skins clássicas"
          data-testid="skins-classic-grid"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5"
        >
          {classicPresets.map((preset, i) => (
            <motion.div key={preset.id} initial={motionInitial} animate="visible" variants={fadeUp} custom={2.5 + i * 0.05}>
              <PresetCard preset={preset} isActive={config.preset === preset.id} onSelect={applyPreset} />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Skins Opera GX */}
      <motion.div initial={motionInitial} animate="visible" variants={fadeUp} custom={1}>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Gamepad2 className="h-4 w-4" /> Skins Opera GX <span>({gxPresets.length})</span>
          <span className="rounded-md border border-primary/30 bg-primary/15 text-[10px] font-bold uppercase tracking-wide text-primary px-1.5 py-0.5">
            GAMER
          </span>
        </h4>
        <div
          role="radiogroup"
          aria-label="Skins Opera GX"
          data-testid="skins-gx-grid"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5"
        >
          {gxPresets.map((preset, i) => (
            <motion.div key={preset.id} initial={motionInitial} animate="visible" variants={fadeUp} custom={2.5 + i * 0.05}>
              <PresetCard preset={preset} isActive={config.preset === preset.id} onSelect={applyPreset} />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Raio da borda */}
      <motion.div initial={motionInitial} animate="visible" variants={fadeUp} custom={2}>
        <BorderRadiusControl value={config.borderRadius} onChange={(v) => updateConfig({ borderRadius: v })} />
      </motion.div>
    </div>
  );
}
