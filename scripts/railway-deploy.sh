#!/bin/bash

# Railway Deployment Helper Script
# This script helps deploy the application to Railway via CLI

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🚂 Railway Deployment Helper"
echo "============================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI is not installed${NC}"
    echo ""
    echo "Install it with:"
    echo "  npm install -g @railway/cli"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Railway CLI found${NC}"
echo ""

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Railway${NC}"
    echo "Logging in..."
    railway login
fi

echo -e "${GREEN}✅ Logged in to Railway${NC}"
echo ""

# Show current project
echo -e "${BLUE}📊 Current Railway Project:${NC}"
railway status || echo -e "${YELLOW}⚠️  No project linked. Will create/link during deployment.${NC}"
echo ""

# Ask for confirmation
echo -e "${YELLOW}⚠️  This will deploy to Railway. Continue? (y/n)${NC}"
read -r response
if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo -e "${BLUE}🚀 Deploying to Railway...${NC}"
echo ""

# Deploy
railway up

echo ""
echo -e "${GREEN}✅ Deployment initiated!${NC}"
echo ""
echo "Monitor your deployment at:"
echo "  https://railway.app/dashboard"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo "1. Set environment variables in Railway Dashboard"
echo "2. Add PostgreSQL database (if not already added)"
echo "3. Import database schema: railway run psql < schema.sql"
echo "4. Monitor logs: railway logs"
echo ""
