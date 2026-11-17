import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// `leading-snug` (e nao `leading-none`): o rotulo de duas linhas nao cola uma na
// outra. E o valor do tema mais proximo do token do proprio `text-sm`
// (1.25rem = 20px no `tailwind.config.ts`), entao o rotulo segue a escala do sistema.
const labelVariants = cva("text-sm font-medium leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70");

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
