#!/usr/bin/env bash
set -e
FILES=(
  src/components/inbox/AIConversationAssistant.tsx
  src/components/inbox/ConversationSummary.tsx
  src/components/inbox/ObjectionDetector.tsx
  src/components/inbox/UniversityHelp.tsx
  src/components/inbox/ai-tools/HistoryTab.tsx
  src/components/inbox/ai-tools/PeriodFilterSelector.tsx
  src/components/inbox/ai-tools/SentimentTab.tsx
  src/components/inbox/ai-tools/ToolPanel.tsx
  src/components/inbox/ai-tools/VisionIcon.tsx
  src/components/inbox/summary/SummaryResult.tsx
)
SCRIPTS=(
  src/components/inbox/ai-tools/__tests__/a11y-ferramentas-ia.test.tsx
  src/components/inbox/__tests__/ferramentas-ia.anuncio-estado.test.tsx
)
echo "== revertendo fontes para a base (HEAD~1) =="
git checkout HEAD~1 -- "${FILES[@]}"
echo "== VERMELHO =="
npx vitest run "${SCRIPTS[@]}" 2>&1 | grep -E 'Test Files|Tests ' || true
echo "== restaurando do commit =="
git checkout HEAD -- "${FILES[@]}"
git status --short
