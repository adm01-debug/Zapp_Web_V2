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
import { ToastProvider, Toast, ToastTitle, ToastClose, ToastViewport } from '@/components/ui/toast';

// Prova (a11y) de que os primitivos de UI expõem o nome acessível em PT-BR,
// não mais em inglês ("Close", "More").

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
});
