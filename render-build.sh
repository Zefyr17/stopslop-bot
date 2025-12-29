#!/usr/bin/env bash
# Build script for Render

set -e

echo "Installing dependencies..."
npm install

echo "Generating Prisma Client..."
npm run db:generate

echo "Running database migrations..."
npm run db:deploy

echo "Building TypeScript..."
npm run build

echo "Build complete!"
