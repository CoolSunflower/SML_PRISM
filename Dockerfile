# docker build --no-cache -t adarshtesting1/sml-backend:latest .
# docker push adarshtesting1/sml-backend:latest

# Use Node.js 20 LTS on Linux
FROM node:20-bookworm

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Set environment variables for HuggingFace cache
ENV HF_HOME=/app/.hf-cache
ENV TRANSFORMERS_CACHE=/app/.hf-cache

# Backend dependencies
COPY package*.json ./
RUN npm ci --only=production

# Pre-download HuggingFace models
COPY models/model_config.json ./models/
COPY scripts/download-models.js ./scripts/
RUN rm -rf /app/.hf-cache /app/node_modules/@huggingface/transformers/.cache && \
    node scripts/download-models.js

# Frontend build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Copy remaining application files 
COPY . .

# Expose port (Azure App Service uses PORT env var)
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
