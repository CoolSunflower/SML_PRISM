# docker build --no-cache -t adarshtesting1/sml-backend:latest .
# docker push adarshtesting1/sml-backend:latest

# Use Node.js 18 LTS on Linux
FROM node:20-bookworm

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port (Azure App Service uses PORT env var)
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
