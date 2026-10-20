import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ThemeResetDialogProps {
  onConfirm: () => void;
}

export function ThemeResetDialog({ onConfirm }: ThemeResetDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="theme-reset"
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <RotateCcw className="w-4 h-4 mr-1" /> Original
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="theme-reset-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Restaurar tema original?</AlertDialogTitle>
          <AlertDialogDescription>
            Isso irá reverter a skin e o raio de borda para os valores padrão. Essa ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Restaurar padrão</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
