import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  UserPlus, Search, Users, Filter,
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
      {/* Icon tile */}
      <div className="w-[60px] h-[60px] rounded-xl bg-kpi-blue flex items-center justify-center mb-6">
        {type === 'no-contacts' && <Users className="w-[26px] h-[26px] text-kpi-blue-fg" />}
        {type === 'no-results' && <Search className="w-[26px] h-[26px] text-kpi-blue-fg" />}
        {type === 'filtered-empty' && <Filter className="w-[26px] h-[26px] text-kpi-blue-fg" />}
      </div>

      {/* Text content */}
      {type === 'no-contacts' && (
        <>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Comece sua base de contatos
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-6 leading-relaxed">
            Adicione seu primeiro contato manualmente para começar sua base de clientes e leads
          </p>
          <div className="flex items-center gap-3">
            {onAddContact && (
              <Button onClick={onAddContact} className="gap-2 bg-success hover:bg-success/90 text-white">
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
