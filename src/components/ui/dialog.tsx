import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// max-h + overflow-y-auto na BASE: o Radix trava o scroll do body, entao um
// dialogo mais alto que a viewport (ex.: ContactForm em 1280x720) tinha o rodape
// inalcancavel; a variante `full` mantem seu max-h-[95vh] via tailwind-merge.
const dialogContentVariants = cva(
  "fixed left-[50%] top-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-full translate-x-[-50%] translate-y-[-50%] overflow-y-auto gap-4 border border-border/60 bg-background p-6 shadow-2xl shadow-background/50 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-2xl",
  {
    variants: {
      size: {
        sm: "max-w-sm",
        default: "max-w-lg",
        lg: "max-w-2xl",
        xl: "max-w-4xl",
        full: "max-w-[95vw] max-h-[95vh]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {
  showCloseButton?: boolean;
  /**
   * Contêiner do portal. Sem ele o Radix monta o conteúdo em DUAS etapas
   * (`@radix-ui/react-portal`: `useState(false)` + `useLayoutEffect(() => setMounted(true))`
   * e `container = containerProp || (mounted && document.body)`): o portal nasce no primeiro
   * commit, mas o conteúdo só no segundo — e esse commit não re-renderiza o componente que
   * montou o diálogo. Um efeito de layout que leia a ref de um elemento do conteúdo (ex.: o
   * volume global das mídias no `MediaPreviewDialog`, t_fe46ce81) roda uma vez com a ref nula
   * e não volta. Com o contêiner explícito o portal monta o conteúdo no PRIMEIRO commit.
   */
  container?: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>["container"];
}

// Procura um <DialogDescription> (ou o primitivo do Radix) na árvore de filhos.
// Quando ele existe, o Radix resolve o `aria-describedby` com o id dele sozinho:
// injetar o nosso quebraria o vínculo com a descrição real.
function temFilhoDescricao(children: React.ReactNode): boolean {
  let achou = false;
  React.Children.forEach(children, (child) => {
    if (achou || !React.isValidElement(child)) return;
    const tipo = child.type as unknown;
    if (tipo === DialogDescription || tipo === DialogPrimitive.Description) {
      achou = true;
      return;
    }
    const filhos = (child.props as { children?: React.ReactNode } | undefined)?.children;
    if (filhos && temFilhoDescricao(filhos)) achou = true;
  });
  return achou;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, size, showCloseButton = true, container, ...props }, ref) => {
  // A11y: sem descrição o leitor de tela anuncia o diálogo só pelo título, e o
  // Radix ainda loga "Missing `Description` or `aria-describedby={undefined}`".
  // Injetamos uma descrição oculta em pt-BR SOMENTE quando o chamador não
  // informa `aria-describedby` E não há <DialogDescription> filho.
  //
  // O gatilho é a AUSÊNCIA DA CHAVE em props, não o valor: várias telas da V2
  // passam `aria-describedby={undefined}` de propósito para silenciar o aviso do
  // Radix sem descrição, e nesse caso respeitamos a decisão e não injetamos nada.
  // O id e o `aria-describedby` ficam com o Radix: ele já liga o
  // DialogPrimitive.Description ao diálogo pelo contexto, e passar um id nosso
  // competiria com essa resolução.
  const temDescribedByProp = Object.prototype.hasOwnProperty.call(props, 'aria-describedby');
  const precisaDescricaoAutomatica = !temDescribedByProp && !temFilhoDescricao(children);
  return (
  <DialogPortal container={container}>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(dialogContentVariants({ size }), className)}
      {...props}
    >
      {children}
      {precisaDescricaoAutomatica && (
        <DialogPrimitive.Description className="sr-only">
          Conteúdo da caixa de diálogo
        </DialogPrimitive.Description>
      )}
      {showCloseButton && (
        <DialogPrimitive.Close className="absolute right-4 top-4 z-10 rounded-lg p-1 opacity-70 ring-offset-background transition-all hover:opacity-100 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none alvo-toque-44">
          <X className="h-4 w-4" />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-display font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  dialogContentVariants,
};
