# Guia de Consolidação: Empty States

## Problema identificado

O projeto possui **6 implementações separadas** do componente de estado vazio:

| Arquivo | Descrição | Uso atual |
|---|---|---|
| `src/components/ui/EmptyState.tsx` | Genérico simples | Vários módulos |
| `src/components/ui/GenericEmptyState.tsx` | Alias/duplicata | Poucos locais |
| `src/components/ui/empty-state.tsx` | Versão shadcn-style | Poucos locais |
| `src/components/ui/empty-states.tsx` | Múltiplos tipos | Vários módulos |
| `src/components/ui/contextual-empty-states.tsx` | Contextual | Dashboard |
| `src/components/ui/empty-states/ContextualEmptyState.tsx` | Contextual v2 | Contacts |

## Padrão canônico a adotar

### Componente único: `src/components/ui/empty-state.tsx`

```tsx
// src/components/ui/empty-state.tsx — ÚNICO ponto de verdade
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Ícone ou ilustração */
  icon?: ReactNode;
  /** Título principal */
  title: string;
  /** Descrição adicional */
  description?: string;
  /** CTA — botão ou link */
  action?: ReactNode;
  /** Classes extras para o container */
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 p-8 text-center",
        className,
      )}
    >
      {icon && (
        <div className="text-muted-foreground/40 [&_svg]:h-12 [&_svg]:w-12">
          {icon}
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
```

## Plano de migração (por etapas)

### Etapa 1 — Consolidar interfaces (sem quebrar nada)
- Adicionar exports de compatibilidade no arquivo canônico para os nomes antigos
- `export { EmptyState as GenericEmptyState }` etc.

### Etapa 2 — Migrar módulo a módulo
Prioridade por frequência de uso:
1. `src/components/contacts/*`
2. `src/components/inbox/*`
3. `src/components/dashboard/*`
4. Demais módulos

### Etapa 3 — Remover arquivos obsoletos
Após todas as referências migrarem, deletar:
- `src/components/ui/GenericEmptyState.tsx`
- `src/components/ui/EmptyState.tsx` (substituído por empty-state.tsx)
- `src/components/ui/contextual-empty-states.tsx`
- `src/components/ui/empty-states/ContextualEmptyState.tsx`

## Componentes duplicados encontrados no projeto

### Duplicatas confirmadas (mesmo propósito, dois arquivos)

| Componente | Localização 1 | Localização 2 | Ação recomendada |
|---|---|---|---|
| `BulkActionsBar` | `src/components/BulkActionsBar.tsx` | `src/components/contacts/BulkActionsBar.tsx` | Manter contacts/, remover root se não for usado diretamente |
| `FloatingParticles` | `src/components/dashboard/FloatingParticles.tsx` | `src/components/voice/FloatingParticles.tsx` | Mover para `src/components/effects/` e importar de lá |
| `ConversationHeatmap` | `src/components/dashboard/ConversationHeatmap.tsx` | `src/components/reports/ConversationHeatmap.tsx` | Verificar se são iguais ou variantes; unificar se iguais |
| `ScheduledReportsManager` | `src/components/dashboard/ScheduledReportsManager.tsx` | `src/components/reports/ScheduledReportsManager.tsx` | Idem |
| `MiniSparkline` | `src/components/dashboard/MiniSparkline.tsx` | `src/components/dashboard/metrics/MiniSparkline.tsx` | Manter metrics/, remover root |
| `TrendIndicator` | `src/components/dashboard/TrendIndicator.tsx` | `src/components/dashboard/metrics/TrendIndicator.tsx` | Manter metrics/, remover root |
| `MetricComparison` | `src/components/dashboard/MetricComparison.tsx` | `src/components/dashboard/metrics/MetricComparison.tsx` | Manter metrics/, remover root |

### Processo seguro de remoção de duplicatas

```bash
# 1. Verificar referências ao arquivo a ser removido
grep -r "from.*dashboard/MiniSparkline" src/

# 2. Se houver referências, atualizar para o novo caminho
# 3. Confirmar build sem erros
# 4. Remover arquivo
```
