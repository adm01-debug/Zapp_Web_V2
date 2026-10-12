import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbEllipsis,
} from '@/components/ui/breadcrumb';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { ToastProvider, Toast, ToastTitle, ToastClose, ToastViewport } from '@/components/ui/toast';
import { SidebarProvider } from '@/components/ui/sidebar/sidebar-context';
import { SidebarTrigger, SidebarRail } from '@/components/ui/sidebar/sidebar-primitives';

// Prova (a11y) de que os primitivos de UI expõem o nome acessível em PT-BR,
// não mais em inglês ("Close", "More", "Previous", "Next", "Toggle Sidebar").

describe('primitivos de UI — nome acessível em PT-BR', () => {
  it('Dialog expõe o botão de fechar como "Fechar"', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Título</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('Sheet expõe o botão de fechar como "Fechar"', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Título</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('BreadcrumbEllipsis anuncia "Mais"', () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    expect(screen.getByText('Mais')).toBeInTheDocument();
    expect(screen.queryByText('More')).toBeNull();
  });

  it('Pagination expõe rótulos em PT-BR ("Anterior"/"Próximo"/"Mais páginas")', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(screen.getByLabelText('Ir para a página anterior')).toBeInTheDocument();
    expect(screen.getByLabelText('Ir para a próxima página')).toBeInTheDocument();
    expect(screen.getByText('Anterior')).toBeInTheDocument();
    expect(screen.getByText('Próximo')).toBeInTheDocument();
    expect(screen.getByText('Mais páginas')).toBeInTheDocument();
    expect(screen.queryByText('Previous')).toBeNull();
    expect(screen.queryByText('Next')).toBeNull();
    expect(screen.queryByLabelText('Go to previous page')).toBeNull();
    expect(screen.queryByLabelText('Go to next page')).toBeNull();
  });

  it('ToastClose expõe o botão de fechar como "Fechar"', () => {
    render(
      <ToastProvider>
        <Toast open onOpenChange={() => {}}>
          <ToastTitle>Aviso</ToastTitle>
          <ToastClose />
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    expect(screen.getByLabelText('Fechar')).toBeInTheDocument();
  });

  it('Sidebar alterna a barra lateral com nome acessível em PT-BR', () => {
    const { unmount } = render(
      <SidebarProvider>
        <SidebarTrigger />
      </SidebarProvider>,
    );
    expect(screen.getByRole('button', { name: 'Alternar barra lateral' })).toBeInTheDocument();
    unmount();

    render(
      <SidebarProvider>
        <SidebarRail />
      </SidebarProvider>,
    );
    expect(screen.getByRole('button', { name: 'Alternar barra lateral' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle Sidebar' })).toBeNull();
  });
});
