import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-xl bg-muted/40 border border-border/40 p-1 text-foreground/80",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

// O trigger tem `min-w-0` para ceder espaco ao flex pai, e **so o texto** vai
// dentro de um `<span className="truncate min-w-0">`.
//
// Por que so o texto: as telas passam icone, rotulo e badge como filhos diretos
// e contam com o `inline-flex` + `gap-*` DO TRIGGER para alinha-los
// (ContactTypeTabs.tsx:48-55, DiagnosticsView.tsx:152-159,
// DashboardTabs.tsx:28-42). Envolver todos os filhos num span unico tiraria os
// tres do flex do trigger — o `gap` pararia de separar, o SVG do icone (que o
// Preflight do Tailwind renderiza como `display:block`) cairia numa linha
// acima do rotulo, e o `overflow:hidden` que vem com `truncate` recortaria os
// badges `absolute` (`-top-1 -right-1` em DiagnosticsView, `inset-0 -z-10` da
// pilha animada em DashboardTabs). Mantendo elemento como filho direto e
// envolvendo apenas string/numero, o ellipsis funciona e o layout nao muda.
//
// Com `asChild` os filhos passam intactos: nesse modo o Radix aplica role, ref,
// tabIndex e disabled ao filho imediato, e um span nosso roubaria esse papel do
// elemento que o consumidor forneceu.
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, asChild, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    asChild={asChild}
    className={cn(
      "inline-flex items-center justify-center min-w-0 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {asChild
      ? children
      : React.Children.map(children, (filho) =>
          typeof filho === "string" || typeof filho === "number" ? (
            <span className="truncate min-w-0">{filho}</span>
          ) : (
            filho
          ),
        )}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
