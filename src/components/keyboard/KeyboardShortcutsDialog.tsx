import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Keyboard, MessageSquare, Navigation, Zap, 
  MousePointerClick, Search, Home, Users, 
  Settings, Moon, RefreshCw, PanelLeft
} from 'lucide-react';
import { useCustomShortcuts, type ShortcutBinding } from '@/hooks/ui/useCustomShortcuts';
import { cn } from '@/lib/utils';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryConfig = {
  chat: { 
    icon: MessageSquare, 
    label: 'Chat', 
    description: 'Atalhos para mensagens',
    gradient: 'from-info/20 to-info/10'
  },
  navigation: { 
    icon: Navigation, 
    label: 'Navegação', 
    description: 'Navegar pela aplicação',
    gradient: 'from-primary/20 to-primary/10'
  },
  actions: { 
    icon: Zap, 
    label: 'Ações Rápidas', 
    description: 'Executar ações comuns',
    gradient: 'from-warning/20 to-warning/10'
  },
  selection: { 
    icon: MousePointerClick, 
    label: 'Seleção', 
    description: 'Gerenciar seleções',
    gradient: 'from-success/20 to-success/10'
  },
};

const additionalShortcuts = [
  { keys: ['?'], description: 'Mostrar esta ajuda', category: 'global' },
  { keys: ['Esc'], description: 'Fechar diálogos e modais', category: 'global' },
  { keys: ['Ctrl', 'K'], description: 'Busca global', category: 'global' },
  { keys: ['G', 'H'], description: 'Ir para Home', category: 'navigation' },
  { keys: ['G', 'I'], description: 'Ir para Inbox', category: 'navigation' },
  { keys: ['G', 'S'], description: 'Ir para Configurações', category: 'navigation' },
];

function ShortcutKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center px-2 py-1 text-xs font-semibold bg-muted/80 border border-border rounded-md shadow-sm min-w-[28px] text-foreground">
      {children}
    </kbd>
  );
}

function ShortcutRow({ shortcut }: { shortcut: ShortcutBinding }) {
  const { formatShortcut } = useCustomShortcuts();
  const keys = formatShortcut(shortcut);
  const isCustomized = !!shortcut.customKey;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors group"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-sm text-foreground truncate">{shortcut.name}</span>
        {isCustomized && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 opacity-60 group-hover:opacity-100">
            Personalizado
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {keys.map((key, index) => (
          <span key={index} className="flex items-center">
            <ShortcutKey>{key}</ShortcutKey>
            {index < keys.length - 1 && (
              <span className="mx-1 text-muted-foreground text-xs">+</span>
            )}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

function CategorySection({ 
  category, 
  shortcuts 
}: { 
  category: keyof typeof categoryConfig; 
  shortcuts: ShortcutBinding[];
}) {
  const config = categoryConfig[category];
  const Icon = config.icon;

  if (shortcuts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r",
        config.gradient
      )}>
        <div className="p-2 rounded-lg bg-background/80 backdrop-blur-sm">
          <Icon className="w-4 h-4 text-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">{config.label}</h3>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </div>
      </div>
      <div className="space-y-0.5 pl-2">
        {shortcuts.map((shortcut) => (
          <ShortcutRow key={shortcut.id} shortcut={shortcut} />
        ))}
      </div>
    </motion.div>
  );
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const { shortcuts } = useCustomShortcuts();

  const groupedShortcuts = {
    chat: shortcuts.filter(s => s.category === 'chat'),
    navigation: shortcuts.filter(s => s.category === 'navigation'),
    actions: shortcuts.filter(s => s.category === 'actions'),
    selection: shortcuts.filter(s => s.category === 'selection'),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[85vh] overflow-hidden">
        <DialogHeader className="pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Keyboard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Atalhos de Teclado</DialogTitle>
              <DialogDescription>
                Use atalhos para trabalhar mais rápido. Pressione{' '}
                <ShortcutKey>?</ShortcutKey> a qualquer momento para ver esta ajuda.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6 py-4">
            <AnimatePresence>
              {Object.entries(groupedShortcuts).map(([category, categoryShortcuts], index) => (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <CategorySection 
                    category={category as keyof typeof categoryConfig} 
                    shortcuts={categoryShortcuts} 
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Additional Tips */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="pt-4 border-t border-border"
            >
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Search className="w-4 h-4" />
                Atalhos Globais
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {additionalShortcuts.map((shortcut, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                  >
                    <span className="text-xs text-muted-foreground">{shortcut.description}</span>
                    <div className="flex items-center gap-0.5">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span key={keyIndex} className="flex items-center">
                          <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-background border border-border rounded">
                            {key}
                          </kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="mx-0.5 text-muted-foreground text-[10px]">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Pro Tip */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20"
            >
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-primary/20">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-1">Dica Pro</h4>
                  <p className="text-xs text-muted-foreground">
                    Você pode personalizar qualquer atalho em{' '}
                    <span className="font-medium text-foreground">Configurações → Atalhos de Teclado</span>.
                    Clique em "Editar" ao lado de qualquer atalho para alterá-lo.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
