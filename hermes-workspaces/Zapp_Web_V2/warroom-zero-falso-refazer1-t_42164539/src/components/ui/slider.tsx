import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /**
   * aria-label do(s) thumb(s) (role="slider" real) — Root não repassa
   * aria-label para eles. Uma string aplica o mesmo label a todos os
   * thumbs; um array dá um label por thumb (por índice).
   */
  thumbLabel?: string | string[];
}

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, thumbLabel, value, defaultValue, orientation, ...props }, ref) => {
    // E36 — antes só um <Thumb> era renderizado, então um Slider de faixa
    // (value=[min, max], 2 valores) ficava com o 2º thumb "invisível"
    // (Radix não desenha thumb sem elemento correspondente). Mapear sobre
    // value/defaultValue.length renderiza 1 thumb por valor, preservando o
    // caso de 1 valor (uso single-thumb já existente em outras telas).
    const thumbCount = (value ?? defaultValue ?? [0]).length;
    // Volume de mídia (fase 2 do plano de volume) usa o slider na vertical: o Radix
    // não define direção/tamanho de eixo, então a trilha precisa acompanhar —
    // sem isso ela continua 8px de altura no meio de um slider de 112px.
    const isVertical = orientation === 'vertical';
    return (
      <SliderPrimitive.Root
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        orientation={orientation}
        className={cn(
          "relative flex touch-none select-none items-center",
          isVertical ? "h-full w-4 flex-col" : "w-full",
          className,
        )}
        {...props}
      >
        <SliderPrimitive.Track className={cn("relative grow overflow-hidden rounded-full bg-background ring-1 ring-inset ring-foreground/30", isVertical ? "h-full w-2" : "h-2 w-full")}>
          <SliderPrimitive.Range className={cn("absolute rounded-full bg-primary", isVertical ? "w-full" : "h-full")} />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbCount }).map((_, i) => (
          <SliderPrimitive.Thumb
            key={i}
            aria-label={Array.isArray(thumbLabel) ? thumbLabel[i] : thumbLabel}
            className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Root>
    );
  },
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
