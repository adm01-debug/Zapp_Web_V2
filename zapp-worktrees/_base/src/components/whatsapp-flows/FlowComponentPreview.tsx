import { CalendarDays, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlowComponent {
  id: string;
  type: 'TextHeading' | 'TextSubheading' | 'TextBody' | 'TextInput' | 'TextArea' | 'DatePicker' | 'RadioButtonsGroup' | 'CheckboxGroup' | 'Dropdown' | 'Image' | 'OptIn' | 'Footer';
  label?: string;
  name?: string;
  required?: boolean;
  options?: { id: string; title: string }[];
  text?: string;
  src?: string;
}

export type { FlowComponent };

export function FlowComponentPreview({ comp, preview, onRemove }: { comp: FlowComponent; preview: boolean; onRemove?: () => void }) {
  return (
    <div className="group relative">
      {!preview && onRemove && (
        <button
          onClick={onRemove}
          className="absolute -right-1 -top-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {renderComponent(comp)}
    </div>
  );
}

function renderComponent(comp: FlowComponent) {
  switch (comp.type) {
    case 'TextHeading':
      return <h2 className="text-lg font-bold text-foreground">{comp.text || 'Título'}</h2>;
    case 'TextSubheading':
      return <h3 className="text-base font-semibold text-foreground">{comp.text || 'Subtítulo'}</h3>;
    case 'TextBody':
      return <p className="text-sm text-muted-foreground">{comp.text || 'Texto'}</p>;
    case 'TextInput':
      return (
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">{comp.label || 'Campo'}</label>
          <div className="h-9 rounded-lg border border-border bg-muted/20 px-3 flex items-center text-sm text-muted-foreground">Digite aqui...</div>
        </div>
      );
    case 'TextArea':
      return (
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">{comp.label || 'Campo'}</label>
          <div className="h-20 rounded-lg border border-border bg-muted/20 px-3 pt-2 text-sm text-muted-foreground">Digite aqui...</div>
        </div>
      );
    case 'DatePicker':
      return (
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">{comp.label || 'Data'}</label>
          <div className="h-9 rounded-lg border border-border bg-muted/20 px-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>dd/mm/aaaa</span>
            <CalendarDays className="w-4 h-4" />
          </div>
        </div>
      );
    case 'RadioButtonsGroup':
      return (
        <div>
          <label className="text-xs font-medium text-foreground mb-2 block">{comp.label || 'Escolha'}</label>
          {comp.options?.map(opt => (
            <div key={opt.id} className="flex items-center gap-2 py-1">
              <div className="w-4 h-4 rounded-full border-2 border-primary" />
              <span className="text-sm">{opt.title}</span>
            </div>
          ))}
        </div>
      );
    case 'CheckboxGroup':
      return (
        <div>
          <label className="text-xs font-medium text-foreground mb-2 block">{comp.label || 'Marque'}</label>
          {comp.options?.map(opt => (
            <div key={opt.id} className="flex items-center gap-2 py-1">
              <div className="w-4 h-4 rounded border-2 border-primary" />
              <span className="text-sm">{opt.title}</span>
            </div>
          ))}
        </div>
      );
    case 'Dropdown':
      return (
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">{comp.label || 'Selecione'}</label>
          <div className="h-9 rounded-lg border border-border bg-muted/20 px-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Selecione...</span>
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      );
    case 'Footer':
      return (
        <button className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium mt-4">
          {comp.label || 'Enviar'}
        </button>
      );
    default:
      return <div className="p-2 bg-muted/20 rounded text-xs text-muted-foreground">{comp.type}</div>;
  }
}
