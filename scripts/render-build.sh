#!/bin/bash

echo "🚀 Starting Render build process..."

# Database snapshots require the PostgreSQL client tools at runtime.
if ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
	apt-get update -qq
	apt-get install -y postgresql-client
fi

# Create necessary directories
mkdir -p uploads/reports
mkdir -p uploads/temp
mkdir -p uploads/students
mkdir -p uploads/staff
mkdir -p uploads/schools
mkdir -p logs

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production=false

# Generate Prisma client
echo "🔄 Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "✅ Build completed successfully!"