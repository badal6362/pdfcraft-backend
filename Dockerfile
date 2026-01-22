# =========================
# Base image
# =========================
FROM node:18-bullseye

# =========================
# Install system dependencies
# =========================
RUN apt-get update && apt-get install -y \
    libreoffice \
    ghostscript \
    fonts-dejavu \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# =========================
# Set working directory
# =========================
WORKDIR /app

# =========================
# Copy package files first (better caching)
# =========================
COPY package*.json ./

# =========================
# Install Node dependencies
# =========================
RUN npm install --production

# =========================
# Copy application code
# =========================
COPY . .

# =========================
# Create required directories
# =========================
RUN mkdir -p uploads output

# =========================
# Environment
# =========================
ENV NODE_ENV=production
ENV PORT=3000

# =========================
# Expose port
# =========================
EXPOSE 3000

# =========================
# Start server
# =========================
CMD ["node", "server.js"]
