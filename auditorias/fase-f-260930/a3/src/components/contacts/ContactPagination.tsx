import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactPaginationProps {
  totalCount: number;
  pageSize: number;
  page: number;
  setPage: (page: number) => void;
  loadMore: () => void;
  loadPrevious: () => void;
  hasMore: boolean;
  loading: boolean;
}

export function ContactPagination({
  totalCount, pageSize, page, setPage, loadMore, loadPrevious, hasMore, loading,
}: ContactPaginationProps) {
  if (totalCount <= pageSize) return null;

  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = page + 1;

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">
        Página <span className="font-semibold text-foreground">{currentPage}</span> de{' '}
        <span className="font-semibold text-foreground">{totalPages}</span>
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="w-8 h-8" onClick={loadPrevious} disabled={page === 0 || loading}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        {getPageNumbers().map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
          ) : (
            <Button
              key={p}
              variant={p === currentPage ? 'default' : 'outline'}
              size="icon"
              className={cn("w-8 h-8 text-xs", p === currentPage && "bg-primary text-primary-foreground")}
              onClick={() => setPage(p - 1)}
              disabled={loading}
            >
              {p}
            </Button>
          )
        )}
        <Button variant="outline" size="icon" className="w-8 h-8" onClick={loadMore} disabled={!hasMore || loading}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
