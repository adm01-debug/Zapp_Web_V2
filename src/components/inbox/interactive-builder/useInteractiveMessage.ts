import { useState, useCallback } from 'react';
import { InteractiveMessage, InteractiveButton, InteractiveListSection } from '@/types/chat';
import { toast } from '@/hooks/ui/use-toast';

export function useInteractiveMessage() {
  const [messageType, setMessageType] = useState<'buttons' | 'list'>('buttons');
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('');
  const [headerText, setHeaderText] = useState('');
  const [buttons, setButtons] = useState<InteractiveButton[]>([]);
  const [listButtonText, setListButtonText] = useState('Ver opções');
  const [sections, setSections] = useState<InteractiveListSection[]>([]);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const resetForm = useCallback(() => {
    setMessageType('buttons');
    setBody('');
    setFooter('');
    setHeaderText('');
    setButtons([]);
    setListButtonText('Ver opções');
    setSections([]);
    setExpandedSections([]);
  }, []);

  const addButton = useCallback((type: InteractiveButton['type']) => {
    if (buttons.length >= 3) {
      toast({ title: 'Limite atingido', description: 'Máximo de 3 botões por mensagem (limite WhatsApp)', variant: 'destructive' });
      return;
    }
    const newButton: InteractiveButton = {
      type,
      id: `btn_${Date.now()}`,
      title: '',
      ...(type === 'url' && { url: '' }),
      ...(type === 'phone' && { phoneNumber: '' }),
    };
    setButtons(prev => [...prev, newButton]);
  }, [buttons.length]);

  const updateButton = useCallback((index: number, updates: Partial<InteractiveButton>) => {
    setButtons(prev => prev.map((b, i) => i === index ? { ...b, ...updates } : b));
  }, []);

  const removeButton = useCallback((index: number) => {
    setButtons(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addSection = useCallback(() => {
    if (sections.length >= 10) {
      toast({ title: 'Limite atingido', description: 'Máximo de 10 seções por lista (limite WhatsApp)', variant: 'destructive' });
      return;
    }
    const newSectionId = `section_${Date.now()}`;
    setSections(prev => [...prev, { title: '', rows: [] }]);
    setExpandedSections(prev => [...prev, newSectionId]);
  }, [sections.length]);

  const updateSection = useCallback((index: number, updates: Partial<InteractiveListSection>) => {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  }, []);

  const removeSection = useCallback((index: number) => {
    setSections(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addRowToSection = useCallback((sectionIndex: number) => {
    setSections(prev => {
      const section = prev[sectionIndex];
      if (section.rows.length >= 10) {
        toast({ title: 'Limite atingido', description: 'Máximo de 10 itens por seção (limite WhatsApp)', variant: 'destructive' });
        return prev;
      }
      return prev.map((s, i) =>
        i === sectionIndex
          ? { ...s, rows: [...s.rows, { id: `row_${Date.now()}`, title: '', description: '' }] }
          : s
      );
    });
  }, []);

  const updateRow = useCallback((sectionIndex: number, rowIndex: number, updates: Partial<{ id: string; title: string; description?: string }>) => {
    setSections(prev =>
      prev.map((s, si) =>
        si === sectionIndex
          ? { ...s, rows: s.rows.map((r, ri) => ri === rowIndex ? { ...r, ...updates } : r) }
          : s
      )
    );
  }, []);

  const removeRow = useCallback((sectionIndex: number, rowIndex: number) => {
    setSections(prev =>
      prev.map((s, si) =>
        si === sectionIndex
          ? { ...s, rows: s.rows.filter((_, ri) => ri !== rowIndex) }
          : s
      )
    );
  }, []);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]
    );
  }, []);

  const getTotalRows = useCallback(() => sections.reduce((acc, s) => acc + s.rows.length, 0), [sections]);

  const validate = useCallback((): boolean => {
    if (!body.trim()) {
      toast({ title: 'Corpo obrigatório', description: 'Digite o texto da mensagem', variant: 'destructive' });
      return false;
    }

    if (messageType === 'buttons') {
      if (buttons.length === 0) {
        toast({ title: 'Adicione botões', description: 'Adicione pelo menos um botão à mensagem', variant: 'destructive' });
        return false;
      }
      for (const button of buttons) {
        if (!button.title?.trim()) {
          toast({ title: 'Título obrigatório', description: 'Todos os botões precisam ter um título', variant: 'destructive' });
          return false;
        }
        if ((button.title?.length ?? 0) > 20) {
          toast({ title: 'Título muito longo', description: 'O título do botão deve ter no máximo 20 caracteres', variant: 'destructive' });
          return false;
        }
        if (button.type === 'url' && !button.url) {
          toast({ title: 'URL obrigatória', description: 'Botões de URL precisam ter um link', variant: 'destructive' });
          return false;
        }
        if (button.type === 'phone' && !button.phoneNumber) {
          toast({ title: 'Telefone obrigatório', description: 'Botões de telefone precisam ter um número', variant: 'destructive' });
          return false;
        }
      }
    }

    if (messageType === 'list') {
      if (sections.length === 0) {
        toast({ title: 'Adicione seções', description: 'Adicione pelo menos uma seção à lista', variant: 'destructive' });
        return false;
      }
      for (const section of sections) {
        if (!section.title.trim()) {
          toast({ title: 'Título de seção obrigatório', description: 'Todas as seções precisam ter um título', variant: 'destructive' });
          return false;
        }
        if (section.rows.length === 0) {
          toast({ title: 'Adicione itens', description: `A seção "${section.title}" precisa ter pelo menos um item`, variant: 'destructive' });
          return false;
        }
        for (const row of section.rows) {
          if (!row.title.trim()) {
            toast({ title: 'Título de item obrigatório', description: 'Todos os itens precisam ter um título', variant: 'destructive' });
            return false;
          }
        }
      }
      if (!listButtonText.trim()) {
        toast({ title: 'Texto do botão obrigatório', description: 'Digite o texto do botão que abrirá a lista', variant: 'destructive' });
        return false;
      }
    }

    return true;
  }, [body, buttons, listButtonText, messageType, sections]);

  const buildMessage = useCallback((): InteractiveMessage => ({
    type: messageType,
    body: body.trim(),
    ...(headerText && { header: { type: 'text' as const, text: headerText } }),
    ...(footer && { footer }),
    ...(messageType === 'buttons' && { buttons }),
    ...(messageType === 'list' && { listButtonText, sections }),
  }), [body, buttons, footer, headerText, listButtonText, messageType, sections]);

  return {
    messageType, setMessageType,
    body, setBody,
    footer, setFooter,
    headerText, setHeaderText,
    buttons, listButtonText, setListButtonText,
    sections, expandedSections,
    resetForm, addButton, updateButton, removeButton,
    addSection, updateSection, removeSection,
    addRowToSection, updateRow, removeRow,
    toggleSection, getTotalRows,
    validate, buildMessage,
  };
}
