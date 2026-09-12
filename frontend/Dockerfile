# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .
# Standalone output is configured in next.config.mjs; build it so the
# runtime image only needs the standalone server + static assets.
RUN npm run build

# Runtime stage — Next.js standalone server
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Copy the standalone server (only the minimal production files).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
