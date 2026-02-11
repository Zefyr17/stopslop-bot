#!/usr/bin/env bash
# Build script for Render

set -e

echo "Installing dependencies..."
npm install --include=dev

echo "Generating Prisma Client..."
npm run db:generate

echo "Running database migrations..."
npx prisma migrate resolve --rolled-back 20260211_spam_penalty_per_post
npm run db:deploy

echo "Building TypeScript..."
npm run build

echo "Build complete!"
