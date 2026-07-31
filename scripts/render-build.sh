#!/bin/bash

echo "🚀 Starting Render build process..."

# Set Puppeteer cache directory
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

# Create necessary directories
mkdir -p /opt/render/.cache/puppeteer
mkdir -p uploads/reports
mkdir -p uploads/temp
mkdir -p uploads/students
mkdir -p uploads/staff
mkdir -p uploads/schools
mkdir -p logs

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production=false

# Install Puppeteer Chrome
echo "🔄 Installing Puppeteer Chrome..."
npx puppeteer browsers install chrome

# Generate Prisma client
echo "🔄 Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "✅ Build completed successfully!"