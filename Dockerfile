# Use Node.js LTS Alpine image for minimal size
FROM node:22-alpine AS base

# Install dependencies needed for ffprobe and other tools
RUN apk add --no-cache \
    ffmpeg \
    sqlite \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Build the application
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the Next.js application
ENV NODE_ENV production
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Create directories for data persistence
RUN mkdir -p uploads prisma/data
RUN chown -R nextjs:nodejs uploads prisma/data

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]