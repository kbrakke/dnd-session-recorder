# Use Node.js LTS Alpine image for minimal size
FROM node:22-alpine AS base

# Install dependencies needed for ffprobe and other tools
RUN apk add --no-cache \
    ffmpeg \
    sqlite \
    curl \
    postgresql-client \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm cache clean --force && \
    npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    (npm ci --only=production || npm install --only=production)

# Build the application
FROM base AS builder
COPY package.json package-lock.json ./

# Install dependencies with retry configuration
RUN npm cache clean --force && \
    npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    (npm ci || npm install)
COPY . .

# Generate Prisma client (using PostgreSQL provider from schema.prisma)
RUN npx prisma generate

# Build the Next.js application
# Accept NEXT_PUBLIC_* build args for client-side env vars
ARG NEXT_PUBLIC_GOOGLE_ENABLED=true
ENV NODE_ENV=production
ENV NEXT_PUBLIC_GOOGLE_ENABLED=$NEXT_PUBLIC_GOOGLE_ENABLED
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json

# Install Prisma CLI for migrations (needed for release command)
# We install it separately to ensure it's available
RUN npm install -g prisma@6.12.0

# Copy entrypoint script (as root for proper permissions)
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create directories for data persistence  
RUN mkdir -p uploads /app/data /app/data/uploads
RUN chown -R nextjs:nodejs uploads /app/data

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Set entrypoint and start command
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]