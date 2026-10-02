#!/bin/bash

echo "🚀 Starting Render build process..."

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