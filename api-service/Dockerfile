FROM node:20-alpine

WORKDIR /app

# Install dependencies first (Docker layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
