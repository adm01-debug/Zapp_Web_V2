/**
 * X093 — Dialog de importação de templates TalkX (CSV ou JSON).
 *
 * Limite: 500 linhas e 2 MB. Cada linha tem pré-visualização de problemas.
 * Conflito por template: pular, sobrescrever ou criar cópia.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Upload, X, AlertTriangle, CheckCircle2, FileJson, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  parseTemplateFile,
  serializeTemplatesToCsv,
  serializeTemplatesToJson,
  downloadTemplateFile,
  TEMPLATE_FILE_MAX_BYTES,
  TEMPLATE_FILE_MAX_ROWS,
  type ParsedTemplateRow,
  type ConflictAction,
  type TemplateImportRow,
} from './talkxTemplateFile';
import type { TalkXTemplate, TemplateInput } from '@/hooks/integrations/useTalkXTemplates';

interface Props {
  existingTemplates: TalkXTemplate[];
  onImport: (rows: Array<{ row: TemplateImportRow; action: ConflictAction }>) => Promise<{ imported: number; skipped: number; errors: number }>;
  onClose: () => void;
}

type GlobalConflict = 'skip' | 'overwrite' | 'copy';

export function TalkXTemplateImportDialog({ existingTemplates, onImport, onClose }: Props) {
  const [parsed, setParsed] = useState<ParsedTemplateRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [globalConflict, setGlobalConflict] = useState<GlobalConflict>('skip');
  const [perRowConflict, setPerRowConflict] = useState<Record<number, ConflictAction>>({});
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const existingNames = useMemo(() => new Set(existingTemplates.map((t) => t.name)), [existingTemplates]);

  const processFile = useCallback((file: File) => {
    setFatalError(null);
    setFileError(null);
    setParsed(null);
    setResult(null);
    setPerRowConflict({});

    if (file.size > TEMPLATE_FILE_MAX_BYTES) {
      setFileError(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 2 MB.`);
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'json') {
      setFileError('Formato não suportado. Use .csv ou .json.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parseResult = parseTemplateFile(text, ext as 'csv' | 'json', existingNames);
      if (parseResult.fatalError) {
        setFatalError(parseResult.fatalError);
      } else {
        setParsed(parseResult.rows);
        setTruncated(parseResult.truncated);
      }
    };
    reader.readAsText(file, 'utf-8');
  }, [existingNames]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const conflictFor = (row: ParsedTemplateRow): ConflictAction => {
    if (!row.isConflict) return 'overwrite';
    return perRowConflict[row.index] ?? globalConflict;
  };

  const handleImport = async () => {
    if (!parsed) return;
    setIsImporting(true);
    try {
      const payload = parsed
        .filter((r) => r.issues.filter((i) => i.field === 'name' || i.field === 'content').length === 0)
        .map((r) => ({ row: r.raw, action: conflictFor(r) }));
      const res = await onImport(payload);
      setResult(res);
    } finally {
      setIsImporting(false);
    }
  };

  const validRows = parsed?.filter((r) => r.issues.filter((i) => i.field === 'name' || i.field === 'content').length === 0) ?? [];
  const conflictRows = validRows.filter((r) => r.isConflict);
  const errorRows = parsed?.filter((r) => r.issues.some((i) => i.field === 'name' || i.field === 'content')) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="relative bg-card border border-border/70 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-violet-400" />
            <h2 className="text-base font-bold text-foreground">Importar Templates</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50">
            <X className="w-4 h-4 text-foreground-secondary" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Drop zone */}
          {!parsed && !fatalError && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                isDragging ? 'border-violet-400 bg-violet-500/10' : 'border-border/50 hover:border-violet-400/60',
              )}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto text-foreground-secondary mb-2" />
              <p className="text-sm font-medium text-foreground">Arraste um arquivo .csv ou .json aqui</p>
              <p className="text-xs text-foreground-secondary mt-1">ou clique para selecionar</p>
              <p className="text-2xs text-muted-foreground mt-2">Máximo {TEMPLATE_FILE_MAX_ROWS} linhas · 2 MB</p>
              <input ref={fileRef} type="file" accept=".csv,.json" className="hidden" onChange={onFileChange} />
            </div>
          )}

          {fileError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {fileError}
              <button type="button" onClick={() => { setFileError(null); }} className="ml-auto hover:text-red-300">Limpar</button>
            </div>
          )}

          {fatalError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {fatalError}
              <button type="button" onClick={() => { setFatalError(null); }} className="ml-auto hover:text-red-300">Tentar outro arquivo</button>
            </div>
          )}

          {/* Result state */}
          {result && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 space-y-1">
              <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                Importação concluída
              </div>
              <p className="text-xs text-foreground-secondary">
                {result.imported} importados · {result.skipped} pulados · {result.errors} erros
              </p>
            </div>
          )}

          {/* Preview */}
          {parsed && !result && (
            <>
              {truncated && (
                <p className="text-2xs text-amber-400">
                  Arquivo truncado — mostrando apenas os primeiros {TEMPLATE_FILE_MAX_ROWS} registros.
                </p>
              )}

              {/* Conflict global control */}
              {conflictRows.length > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs text-amber-300">{conflictRows.length} conflito(s) — template com mesmo nome já existe</span>
                  <select
                    value={globalConflict}
                    onChange={(e) => { setGlobalConflict(e.target.value as GlobalConflict); setPerRowConflict({}); }}
                    className="ml-auto text-2xs bg-input/60 border border-border/60 rounded px-2 py-1 text-foreground"
                  >
                    <option value="skip">Pular todos</option>
                    <option value="overwrite">Sobrescrever todos</option>
                    <option value="copy">Criar cópia de todos</option>
                  </select>
                </div>
              )}

              {/* Table */}
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <table className="w-full text-2xs">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-foreground-secondary w-1/3">Nome</th>
                      <th className="text-left px-3 py-2 font-semibold text-foreground-secondary">Categoria</th>
                      <th className="text-left px-3 py-2 font-semibold text-foreground-secondary">Estado</th>
                      {conflictRows.length > 0 && <th className="text-left px-3 py-2 font-semibold text-foreground-secondary">Conflito</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((row) => {
                      const hasBlocker = row.issues.some((i) => i.field === 'name' || i.field === 'content');
                      return (
                        <tr key={row.index} className={cn('border-t border-border/30', hasBlocker && 'opacity-60')}>
                          <td className="px-3 py-2">
                            <span className="truncate block max-w-[180px]">{row.raw.name || <span className="italic text-muted-foreground">sem nome</span>}</span>
                            {row.issues.map((issue) => (
                              <span key={issue.field} className="block text-red-400">{issue.message}</span>
                            ))}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{row.raw.category || '—'}</td>
                          <td className="px-3 py-2">
                            {hasBlocker ? (
                              <span className="text-red-400">Erro</span>
                            ) : row.isConflict ? (
                              <span className="text-amber-400">Conflito</span>
                            ) : (
                              <span className="text-green-400">Ok</span>
                            )}
                          </td>
                          {conflictRows.length > 0 && (
                            <td className="px-3 py-2">
                              {row.isConflict && !hasBlocker && (
                                <select
                                  value={perRowConflict[row.index] ?? globalConflict}
                                  onChange={(e) => setPerRowConflict((prev) => ({ ...prev, [row.index]: e.target.value as ConflictAction }))}
                                  className="text-2xs bg-input/60 border border-border/60 rounded px-1.5 py-0.5 text-foreground"
                                >
                                  <option value="skip">Pular</option>
                                  <option value="overwrite">Sobrescrever</option>
                                  <option value="copy">Criar cópia</option>
                                </select>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-2xs text-muted-foreground">
                {validRows.length} válidos · {errorRows.length} com erro · {conflictRows.length} conflitos
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        {parsed && !result && (
          <div className="px-5 py-4 border-t border-border/50 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={() => { setParsed(null); setFatalError(null); setPerRowConflict({}); }}
              className="h-9 px-4 rounded-lg border border-border/70 bg-input/40 text-xs font-medium text-foreground-secondary hover:bg-muted/50"
            >
              Trocar arquivo
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting || validRows.length === 0}
              className="h-9 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isImporting ? 'Importando…' : `Importar ${validRows.length} template${validRows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {result && (
          <div className="px-5 py-4 border-t border-border/50 flex justify-end shrink-0">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white">
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
