#!/bin/bash
PROJECT="submoacontent"
REQUIRED=("COPYLEAKS_API_KEY" "LANGUAGETOOL_API_KEY" "DISCORD_BOT_TOKEN")
MISSING=()

echo "Checking secrets for project: $PROJECT"
echo "---"

for secret in "${REQUIRED[@]}"; do
  result=$(npx wrangler pages secret list 2>/dev/null | grep "$secret")
  if [ -z "$result" ]; then
    echo "❌ MISSING: $secret"
    MISSING+=("$secret")
  else
    echo "✅ Found:   $secret"
  fi
done

echo "---"
if [ ${#MISSING[@]} -gt 0 ]; then
  echo ""
  echo "Add missing secrets with:"
  for s in "${MISSING[@]}"; do
    echo "  npx wrangler pages secret put $s"
  done
  echo ""
  echo "Note: COPYLEAKS_API_KEY covers both AI detection and plagiarism."
  echo "      LANGUAGETOOL_API_KEY is optional — free tier works without a key."
fi
