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
  ({ className, thumbLabel, value, defaultValue, ...props }, ref) => {
    // E36 — antes só um <Thumb> era renderizado, então um Slider de faixa
    // (value=[min, max], 2 valores) ficava com o 2º thumb "invisível"
    // (Radix não desenha thumb sem elemento correspondente). Mapear sobre
    // value/defaultValue.length renderiza 1 thumb por valor, preservando o
    // caso de 1 valor (uso single-thumb já existente em outras telas).
    const thumbCount = (value ?? defaultValue ?? [0]).length;
    return (
      <SliderPrimitive.Root
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        className={cn("relative flex w-full touch-none select-none items-center", className)}
        {...props}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
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
