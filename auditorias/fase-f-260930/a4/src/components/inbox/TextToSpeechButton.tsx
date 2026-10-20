import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface TextToSpeechButtonProps {
  messageId: string;
  text: string;
  isLoading: boolean;
  isPlaying: boolean;
  currentMessageId: string | null;
  onSpeak: (text: string, messageId: string) => void;
  onStop: () => void;
  className?: string;
}

export function TextToSpeechButton({
  messageId,
  text,
  isLoading,
  isPlaying,
  currentMessageId,
  onSpeak,
  onStop,
  className,
}: TextToSpeechButtonProps) {
  const isThisPlaying = isPlaying && currentMessageId === messageId;
  const isThisLoading = isLoading && currentMessageId === messageId;

  const handleClick = () => {
    if (isThisPlaying) {
      onStop();
    } else {
      onSpeak(text, messageId);
    }
  };

  // Don't show for empty or media-only messages
  const cleanText = text
    .replace(/\[.*?\]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
  
  if (!cleanText) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
            (isThisPlaying || isThisLoading) && "opacity-100",
            className
          )}
          onClick={handleClick}
          disabled={isLoading && currentMessageId !== messageId}
        >
          {isThisLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : isThisPlaying ? (
            <VolumeX className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {isThisPlaying ? 'Parar' : 'Ouvir mensagem'}
      </TooltipContent>
    </Tooltip>
  );
}
