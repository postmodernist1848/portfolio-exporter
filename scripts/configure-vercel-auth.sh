#!/bin/sh

set -eu

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl is required to generate a password." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx is required to run the Vercel CLI." >&2
  exit 1
fi

portfolio_auth_username="${1:-portfolio}"
case "$portfolio_auth_username" in
  *:*)
    echo "Error: the Basic Auth username must not contain a colon." >&2
    exit 1
    ;;
esac

portfolio_auth_password="$(openssl rand -base64 32 | tr -d '\n' | tr '/+' '_-')"

printf '%s' "$portfolio_auth_username" |
  npx --yes vercel env add PORTFOLIO_AUTH_USERNAME production --force --sensitive
printf '%s' "$portfolio_auth_password" |
  npx --yes vercel env add PORTFOLIO_AUTH_PASSWORD production --force --sensitive

printf '\nSave these credentials in cron-job.org HTTP Authentication:\n'
printf 'Username: %s\n' "$portfolio_auth_username"
printf 'Password: %s\n\n' "$portfolio_auth_password"
printf 'The variables will take effect on the next production deployment.\n'
