timeout 1200 zapp-verify full "$INT" >"$DIRLOG/.verificacao-da-base.log" 2>&1 9>&- || reteste_isolado "$DIRLOG/.verificacao-da-base.log"
