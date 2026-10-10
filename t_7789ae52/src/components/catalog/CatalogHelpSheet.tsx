import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { HelpCircle, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATALOG_FOCUS_VISIBLE } from './catalogShared';

/**
 * CT-83 — Ajuda do catálogo ("Como usar o catálogo") + tour leve de 1ª visita.
 *
 * O painel explica o fluxo de envio em 5 passos (os mesmos passos reais do
 * `SendProductDialog`: buscar → escolher produto/variação → fotos → modelo de
 * mensagem → contato) e, na 1ª visita, mostra um tour de 4 dicas. Ao concluir
 * (ou pular) o tour, marca `catalog.tourDone` no `localStorage` — nas visitas
 * seguintes o tour não reaparece; o painel de ajuda continua disponível.
 *
 * NOTA (CT-83, aceite parcial): o plano pedia "5 passos com prints reais". Os
 * prints reais NÃO existem neste repositório (docs/catalogo/screens/ só tem
 * mocks de 11/09/2026) e gerá-los exige browser logado — portanto os passos
 * são descritos em texto, sem imagens. Nada de print falso é embutido aqui.
 */

/** Chave do tour de 1ª visita (CT-83). */
export const CATALOG_TOUR_DONE_KEY = 'catalog.tourDone';

/**
 * Lê se o tour já foi concluído. Tolerante a ambiente sem `localStorage`
 * (SSR) e a armazenamento bloqueado/quota — em ambos os casos o tour é
 * mostrado, que é o comportamento seguro.
 */
function readTourDone(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(CATALOG_TOUR_DONE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Marca o tour como concluído. Falha de armazenamento não é erro fatal: o
 * tour simplesmente volta na próxima visita.
 */
function persistTourDone(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CATALOG_TOUR_DONE_KEY, 'true');
  } catch {
    // Storage indisponível (modo restrito/quota): sem persistência, sem quebra.
  }
}

interface HelpStep {
  title: string;
  description: string;
}

/** Passos do fluxo de envio, na ordem real do `SendProductDialog`. */
const HELP_STEPS: HelpStep[] = [
  {
    title: 'Encontre o produto',
    description:
      'Busque por nome, SKU ou marca e refine por categoria, fornecedor, estoque e filtros avançados.',
  },
  {
    title: 'Abra o produto e escolha o que enviar',
    description:
      'No card, abra "Enviar" e selecione "Produto Completo" ou uma "Variação Específica" (cor).',
  },
  {
    title: 'Marque as fotos',
    description:
      'Escolha quais imagens entram na mensagem. Todas as fotos visíveis já vêm selecionadas por padrão.',
  },
  {
    title: 'Escolha o modelo de mensagem',
    description:
      'Formal, Informal ou Promoção — dá para editar o texto. O preview mostra como a mensagem fica no WhatsApp.',
  },
  {
    title: 'Selecione o contato e envie',
    description:
      'Busque o contato, confirme o envio e acompanhe o resultado na aba "Enviados".',
  },
];

/** Dicas do tour de 1ª visita (4 dicas). */
const TOUR_TIPS: HelpStep[] = [
  {
    title: 'Busque e filtre',
    description:
      'A busca cobre nome, SKU e marca. Os filtros avançados refinam por faixa de preço, cor e material.',
  },
  {
    title: 'Escolha o que enviar',
    description:
      'Envie o produto inteiro ou só a variação de uma cor — "Produto Completo" ou "Variação Específica".',
  },
  {
    title: 'Revise fotos e mensagem',
    description:
      'Marque as fotos e revise o texto no modelo Formal, Informal ou Promoção antes de enviar.',
  },
  {
    title: 'Confirme o destinatário',
    description:
      'Ao enviar, selecione o contato. Cada envio aparece depois na aba "Enviados", com o status.',
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CatalogHelpSheet({ open, onOpenChange }: Props) {
  const [tourDone, setTourDone] = React.useState<boolean>(() => readTourDone());
  const [tip, setTip] = React.useState(0);

  const showTour = open && !tourDone;
  const isLastTip = tip === TOUR_TIPS.length - 1;
  const currentTip = TOUR_TIPS[tip];

  const concludeTour = () => {
    persistTourDone();
    setTourDone(true);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[360px] sm:w-[420px] flex flex-col p-0"
        data-testid="catalog-help-sheet"
      >
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
            Como usar o catálogo
          </SheetTitle>
          <SheetDescription>
            O fluxo de envio de produto em 5 passos.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {showTour && (
            <section
              data-testid="catalog-tour"
              aria-label="Tour do catálogo"
              className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-primary">
                  Dica {tip + 1} de {TOUR_TIPS.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={concludeTour}
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                  Pular tour
                </Button>
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground">{currentTip.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{currentTip.description}</p>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setTip((t) => Math.max(0, t - 1))}
                  disabled={tip === 0}
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  Anterior
                </Button>
                {isLastTip ? (
                  <Button size="sm" className="h-8 gap-1" onClick={concludeTour}>
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    Concluir tour
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 gap-1"
                    onClick={() => setTip((t) => Math.min(TOUR_TIPS.length - 1, t + 1))}
                  >
                    Próxima
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </section>
          )}

          <section aria-label="Passos do fluxo de envio" data-testid="catalog-help-steps">
            <h3 className="text-sm font-semibold text-foreground mb-3">Passo a passo do envio</h3>
            <ol className="space-y-3">
              {HELP_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <SheetFooter className="px-6 py-4 border-t">
          <Button
            variant="outline"
            className={cn('w-full', CATALOG_FOCUS_VISIBLE)}
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
