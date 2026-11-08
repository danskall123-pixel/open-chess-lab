set -e
npx prisma migrate deploy
if [ "$SEED_DEMO_USERS" = "true" ]; then
  node dist/seed.js
fi
exec node dist/main.js
