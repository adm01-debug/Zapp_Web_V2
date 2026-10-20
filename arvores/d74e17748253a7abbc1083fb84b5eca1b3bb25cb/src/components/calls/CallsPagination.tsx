import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { janelaDePaginas } from './paginas';


interface CallsPaginationProps {
  page: number;
  pages: number;
  onPageChange: (pagina: number) => void;
}

export function CallsPagination({ page, pages, onPageChange }: CallsPaginationProps) {
  if (pages <= 1) return null;
  const janela = janelaDePaginas(page, pages);

  return (
    <nav className="flex items-center justify-center gap-1 px-4 py-3" aria-label="Paginação do histórico" data-testid="tel-pagination">
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {janela.map((n) => (
        <Button
          key={n}
          variant={n === page ? 'default' : 'ghost'}
          size="sm"
          className="h-9 w-9 p-0 text-xs"
          aria-current={n === page ? 'page' : undefined}
          onClick={() => onPageChange(n)}
        >
          {n}
        </Button>
      ))}

      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0"
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Próxima página"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
