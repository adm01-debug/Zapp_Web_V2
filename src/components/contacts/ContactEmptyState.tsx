import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  UserPlus, Search, Users, Filter, MessageSquareOff, AlertTriangle,
} from 'lucide-react';

interface ContactEmptyStateProps {
  type: 'no-contacts' | 'no-results' | 'filtered-empty' | 'unavailable' | 'error';
  searchQuery?: string;
  activeFilters?: number;
  onAddContact?: () => void;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  /** ZD-047 — mensagem técnica/contexto do erro e ação de tentar de novo. */
  errorMessage?: string;
  onRetry?: () => void;
}

/** Ícones das dicas do estado "sem contatos" — antes eram emojis (📱🏷️📊). */
const DICAS = [
  { Icon: MessageSquareOff, title: 'WhatsApp', desc: 'Integre conversas' },
  { Icon: Filter, title: 'Tags', desc: 'Organize por categorias' },
  { Icon: Users, title: 'Analytics', desc: 'Acompanhe métricas' },
];

export function ContactEmptyState({
  type, searchQuery, activeFilters = 0,
  onAddContact, onClearSearch, onClearFilters,
  errorMessage, onRetry,
}: ContactEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex min-h-[445px] max-[559px]:min-h-[500px] flex-col items-center justify-center gap-[10px] text-center px-5 py-[35px] rounded-[12px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-panel))] col-span-full text-xs text-muted-foreground"
      role={type === 'error' ? 'alert' : 'status'}
    >
      {type === 'no-contacts' && <Users className="w-8 h-8 text-[hsl(var(--contacts-quiet))]" />}
      {type === 'no-results' && <Search className="w-8 h-8 text-[hsl(var(--contacts-quiet))]" />}
      {type === 'filtered-empty' && <Filter className="w-8 h-8 text-[hsl(var(--contacts-quiet))]" />}
      {type === 'unavailable' && <MessageSquareOff className="w-8 h-8 text-[hsl(var(--contacts-quiet))]" />}
      {type === 'error' && <AlertTriangle className="w-8 h-8 text-warning" />}

      {type === 'no-contacts' && (
        <>
          <h3 className="font-display text-lg sm:text-[23px] leading-tight font-semibold text-foreground mt-[5px]">
            Comece sua base de contatos
          </h3>
          <p className="max-w-[480px] leading-relaxed">
            Adicione seu primeiro contato manualmente para começar sua base de contatos
          </p>
          {onAddContact && (
            <Button onClick={onAddContact} className="mt-2 gap-2 bg-success hover:bg-success/90 text-success-foreground">
              <UserPlus className="w-4 h-4" />
              Novo Contato
            </Button>
          )}

          <div className="mt-8 grid grid-cols-3 gap-4 max-w-md max-[559px]:grid-cols-1">
            {DICAS.map(({ Icon, title, desc }) => (
              <motion.div
                key={title}
                whileHover={{ y: -2 }}
                className="text-center p-3 rounded-[11px] bg-muted/30 border border-[hsl(var(--contacts-line))]"
              >
                <Icon className="w-[18px] h-[18px] mx-auto text-[hsl(var(--contacts-quiet))]" />
                <p className="text-xs font-medium text-foreground mt-1">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {type === 'no-results' && (
        <>
          <h3 className="font-display text-lg sm:text-[23px] leading-tight font-semibold text-foreground mt-[5px]">
            Nenhum resultado encontrado
          </h3>
          <p className="max-w-[480px] leading-relaxed">
            Não encontramos contatos com{' '}
            <span className="font-medium text-foreground">"{searchQuery}"</span>.
            Tente outro termo ou limpe a busca.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            {onClearSearch && (
              <Button variant="outline" onClick={onClearSearch} className="gap-2 text-xs">
                <Search className="w-4 h-4" />
                Limpar Busca
              </Button>
            )}
            {onAddContact && (
              <Button variant="ghost" onClick={onAddContact} className="gap-2 text-xs text-muted-foreground">
                <UserPlus className="w-4 h-4" />
                Criar Contato
              </Button>
            )}
          </div>
        </>
      )}

      {type === 'filtered-empty' && (
        <>
          <h3 className="font-display text-lg sm:text-[23px] leading-tight font-semibold text-foreground mt-[5px]">
            Sem contatos neste filtro
          </h3>
          <p className="max-w-[480px] leading-relaxed">
            Os {activeFilters} filtro{activeFilters > 1 ? 's' : ''} aplicado{activeFilters > 1 ? 's' : ''} não retornaram resultados.
            Tente ajustar os critérios.
          </p>
          {onClearFilters && (
            <Button variant="outline" onClick={onClearFilters} className="mt-2 gap-2 text-xs">
              <Filter className="w-4 h-4" />
              Limpar Filtros
            </Button>
          )}
        </>
      )}

      {type === 'unavailable' && (
        <>
          <h3 className="font-display text-lg sm:text-[23px] leading-tight font-semibold text-foreground mt-[5px]">
            Mensagens indisponíveis
          </h3>
          <p className="max-w-[480px] leading-relaxed">
            A integração de mensagens não está disponível agora. Os contatos continuam
            acessíveis normalmente.
          </p>
        </>
      )}

      {type === 'error' && (
        <>
          <h3 className="font-display text-lg sm:text-[23px] leading-tight font-semibold text-foreground mt-[5px]">
            Não foi possível carregar os contatos
          </h3>
          <p className="max-w-[480px] leading-relaxed">
            {errorMessage || 'Ocorreu um erro inesperado ao buscar a lista. Tente novamente.'}
          </p>
          {onRetry && (
            <Button variant="outline" onClick={onRetry} className="mt-2 gap-2 text-xs">
              Tentar novamente
            </Button>
          )}
        </>
      )}
    </motion.div>
  );
}
