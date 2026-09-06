import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  UserPlus, Search, Users, Filter, Sparkles,
} from 'lucide-react';

interface ContactEmptyStateProps {
  type: 'no-contacts' | 'no-results' | 'filtered-empty';
  searchQuery?: string;
  activeFilters?: number;
  onAddContact?: () => void;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
}

export function ContactEmptyState({
  type, searchQuery, activeFilters = 0,
  onAddContact, onClearSearch, onClearFilters,
}: ContactEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center py-16 px-8"
    >
      {/* Animated illustration */}
      <div className="relative w-32 h-32 mb-6">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="w-32 h-32 rounded-3xl bg-primary/10 flex items-center justify-center"
        >
          {type === 'no-contacts' && <Users className="w-14 h-14 text-primary/50" />}
          {type === 'no-results' && <Search className="w-14 h-14 text-primary/50" />}
          {type === 'filtered-empty' && <Filter className="w-14 h-14 text-primary/50" />}
        </motion.div>

        {/* Floating decorative dots */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-accent/30"
        />
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 2.5, repeat: Infinity, delay: 1 }}
          className="absolute -bottom-1 -left-3 w-4 h-4 rounded-full bg-primary/20"
        />
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          className="absolute top-1/2 -right-6 w-3 h-3"
        >
          <Sparkles className="w-3 h-3 text-primary/30" />
        </motion.div>
      </div>

      {/* Text content */}
      {type === 'no-contacts' && (
        <>
          <h3 className="text-lg font-bold text-foreground mb-2">
            Comece sua base de contatos
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-6 leading-relaxed">
            Adicione seu primeiro contato manualmente para começar sua base de clientes e leads
          </p>
          <div className="flex items-center gap-3">
            {onAddContact && (
              <Button onClick={onAddContact} className="gap-2 shadow-lg shadow-primary/20">
                <UserPlus className="w-4 h-4" />
                Novo Contato
              </Button>
            )}
          </div>

          {/* Quick tips */}
          <div className="mt-8 grid grid-cols-3 gap-4 max-w-md">
            {[
              { icon: '📱', title: 'WhatsApp', desc: 'Integre conversas' },
              { icon: '🏷️', title: 'Tags', desc: 'Organize por categorias' },
              { icon: '📊', title: 'Analytics', desc: 'Acompanhe métricas' },
            ].map((tip) => (
              <motion.div
                key={tip.title}
                whileHover={{ y: -2 }}
                className="text-center p-3 rounded-xl bg-muted/30 border border-border/20"
              >
                <span className="text-2xl">{tip.icon}</span>
                <p className="text-xs font-medium text-foreground mt-1">{tip.title}</p>
                <p className="text-[10px] text-muted-foreground">{tip.desc}</p>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {type === 'no-results' && (
        <>
          <h3 className="text-lg font-bold text-foreground mb-2">
            Nenhum resultado encontrado
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-5 leading-relaxed">
            Não encontramos contatos com{' '}
            <span className="font-medium text-foreground">"{searchQuery}"</span>.
            Tente outro termo ou limpe a busca.
          </p>
          <div className="flex items-center gap-3">
            {onClearSearch && (
              <Button variant="outline" onClick={onClearSearch} className="gap-2">
                <Search className="w-4 h-4" />
                Limpar Busca
              </Button>
            )}
            {onAddContact && (
              <Button variant="ghost" onClick={onAddContact} className="gap-2 text-muted-foreground">
                <UserPlus className="w-4 h-4" />
                Criar Contato
              </Button>
            )}
          </div>
        </>
      )}

      {type === 'filtered-empty' && (
        <>
          <h3 className="text-lg font-bold text-foreground mb-2">
            Sem contatos neste filtro
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-5 leading-relaxed">
            Os {activeFilters} filtro{activeFilters > 1 ? 's' : ''} aplicado{activeFilters > 1 ? 's' : ''} não retornaram resultados.
            Tente ajustar os critérios.
          </p>
          {onClearFilters && (
            <Button variant="outline" onClick={onClearFilters} className="gap-2">
              <Filter className="w-4 h-4" />
              Limpar Filtros
            </Button>
          )}
        </>
      )}
    </motion.div>
  );
}
