import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Keyboard, RotateCcw, AlertTriangle, Check, X, MessageSquare, Navigation, Zap, MousePointerClick } from 'lucide-react';
import { useCustomShortcuts, type ShortcutBinding } from '@/hooks/ui/useCustomShortcuts';
import { toast } from 'sonner';

const categoryConfig = {
  chat: { icon: MessageSquare, label: 'Chat', color: 'bg-info/10 text-info' },
  navigation: { icon: Navigation, label: 'Navegação', color: 'bg-primary/10 text-primary' },
  actions: { icon: Zap, label: 'Ações', color: 'bg-warning/10 text-warning' },
  selection: { icon: MousePointerClick, label: 'Seleção', color: 'bg-success/10 text-success' },
};

function ShortcutKeyDisplay({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <span key={index} className="flex items-center">
          <kbd className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded shadow-sm min-w-[28px] text-center">
            {key}
          </kbd>
          {index < keys.length - 1 && (
            <span className="mx-0.5 text-muted-foreground">+</span>
          )}
        </span>
      ))}
    </div>
  );
}

function ShortcutRow({ shortcut }: { shortcut: ShortcutBinding }) {
  const { 
    formatShortcut, 
    isRecording, 
    pendingShortcut,
    startRecording, 
    stopRecording, 
    cancelRecording,
    resetShortcut,
    checkConflict 
  } = useCustomShortcuts();

  const isCurrentlyRecording = isRecording === shortcut.id;
  const isCustomized = !!shortcut.customKey;
  const keys = formatShortcut(shortcut);
  
  const conflict = pendingShortcut && isCurrentlyRecording
    ? checkConflict(shortcut.id, pendingShortcut.key, pendingShortcut.modifiers)
    : null;

  const handleConfirm = () => {
    if (conflict) {
      toast.error(`Conflito com "${conflict.name}". Escolha outro atalho.`);
      return;
    }
    stopRecording();
    toast.success('Atalho atualizado!');
  };

  return (
    <motion.div
      layout
      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
        isCurrentlyRecording ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{shortcut.name}</span>
          {isCustomized && !isCurrentlyRecording && (
            <Badge variant="outline" className="text-xs">
              Personalizado
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{shortcut.description}</p>
      </div>

      <div className="flex items-center gap-2 ml-4">
        <AnimatePresence mode="wait">
          {isCurrentlyRecording ? (
            <motion.div
              key="recording"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2"
            >
              <div className="flex flex-col items-end gap-1">
                {pendingShortcut ? (
                  <div className="flex items-center gap-2">
                    <ShortcutKeyDisplay 
                      keys={[
                        ...(pendingShortcut.modifiers.ctrlKey ? ['Ctrl'] : []),
                        ...(pendingShortcut.modifiers.shiftKey ? ['Shift'] : []),
                        ...(pendingShortcut.modifiers.altKey ? ['Alt'] : []),
                        pendingShortcut.key === ' ' ? 'Space' : pendingShortcut.key
                      ]} 
                    />
                    {conflict && (
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground animate-pulse">
                    Pressione uma tecla...
                  </span>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-success hover:text-success hover:bg-success/10"
                onClick={handleConfirm}
                disabled={!pendingShortcut}
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={cancelRecording}
              >
                <X className="w-4 h-4" />
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="display"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2"
            >
              <ShortcutKeyDisplay keys={keys} />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => startRecording(shortcut.id)}
              >
                Editar
              </Button>
              {isCustomized && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    resetShortcut(shortcut.id);
                    toast.success('Atalho restaurado ao padrão');
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ShortcutCategory({ category, shortcuts }: { category: keyof typeof categoryConfig; shortcuts: ShortcutBinding[] }) {
  const config = categoryConfig[category];
  const Icon = config.icon;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <div className={`p-1.5 rounded-md ${config.color}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">{config.label}</span>
      </div>
      <div className="space-y-1 bg-muted/30 rounded-lg p-1">
        {shortcuts.map(shortcut => (
          <ShortcutRow key={shortcut.id} shortcut={shortcut} />
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsSettings() {
  const { shortcuts, resetAllShortcuts } = useCustomShortcuts();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const groupedShortcuts = {
    chat: shortcuts.filter(s => s.category === 'chat'),
    navigation: shortcuts.filter(s => s.category === 'navigation'),
    actions: shortcuts.filter(s => s.category === 'actions'),
    selection: shortcuts.filter(s => s.category === 'selection'),
  };

  const customizedCount = shortcuts.filter(s => s.customKey).length;

  return (
    <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-whatsapp" />
            <CardTitle>Atalhos de Teclado</CardTitle>
          </div>
          {customizedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {customizedCount} personalizado{customizedCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <CardDescription>
          Personalize os atalhos de teclado para agilizar seu fluxo de trabalho
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ShortcutCategory category="chat" shortcuts={groupedShortcuts.chat} />
        <ShortcutCategory category="navigation" shortcuts={groupedShortcuts.navigation} />
        <ShortcutCategory category="actions" shortcuts={groupedShortcuts.actions} />
        <ShortcutCategory category="selection" shortcuts={groupedShortcuts.selection} />

        <div className="pt-4 border-t border-border">
          {showResetConfirm ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between bg-destructive/10 p-3 rounded-lg"
            >
              <span className="text-sm text-destructive">
                Restaurar todos os atalhos para o padrão?
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowResetConfirm(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    resetAllShortcuts();
                    setShowResetConfirm(false);
                    toast.success('Todos os atalhos restaurados!');
                  }}
                >
                  Restaurar
                </Button>
              </div>
            </motion.div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowResetConfirm(true)}
              disabled={customizedCount === 0}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restaurar Padrões
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
