# Multi-stage build for optimal deployment
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./

# Install root dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build backend
RUN npm run build

# Build frontend
WORKDIR /app/src/ui
COPY src/ui/package*.json ./
COPY src/ui/tsconfig.json ./
RUN npm ci
COPY src/ui ./
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy root package files and install production dependencies only
COPY package*.json ./
RUN npm ci --production

# Copy built backend
COPY --from=builder /app/dist ./dist

# Copy built frontend
COPY --from=builder /app/src/ui/dist ./dist/ui

# Copy schema.sql if needed for reference
COPY schema.sql ./

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000), (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["npm", "start"]
