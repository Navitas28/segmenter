#!/bin/bash

# Test Production Build Script
# This script helps test the production build locally before deploying to Railway

set -e  # Exit on error

echo "🚀 Testing Production Build Locally"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please create .env file based on .env.example"
    exit 1
fi

echo -e "${BLUE}📦 Step 1: Installing root dependencies...${NC}"
npm install

echo ""
echo -e "${BLUE}🔨 Step 2: Building backend...${NC}"
npm run build

echo ""
echo -e "${BLUE}📦 Step 3: Installing UI dependencies...${NC}"
cd src/ui
npm install

echo ""
echo -e "${BLUE}🔨 Step 4: Building frontend...${NC}"
npm run build
cd ../..

echo ""
echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo ""

# Check if dist directories exist
if [ -d "dist" ] && [ -d "src/ui/dist" ]; then
    echo -e "${GREEN}✅ Both backend and frontend builds found${NC}"
    echo ""
    echo "📂 Backend build: ./dist"
    echo "📂 Frontend build: ./src/ui/dist"
    echo ""
else
    echo -e "${RED}❌ Build directories not found${NC}"
    exit 1
fi

# Copy UI build to backend dist
echo -e "${BLUE}📋 Step 5: Copying UI build to backend dist...${NC}"
mkdir -p dist/ui
cp -r src/ui/dist/* dist/ui/

echo ""
echo -e "${GREEN}✅ Production build ready!${NC}"
echo ""
echo "🎯 To start the production server:"
echo "   npm start"
echo ""
echo "🌐 Server will be available at: http://localhost:3000"
echo ""
echo "⚠️  Make sure your .env file has all required variables:"
echo "   - DATABASE_URL"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_SERVICE_ROLE_KEY"
echo ""
