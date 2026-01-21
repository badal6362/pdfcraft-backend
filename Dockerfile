FROM node:20-slim

# -----------------------------
# Install system dependencies
# -----------------------------
RUN apt-get update && apt-get install -y \
    ghostscript \
    libreoffice \
    libreoffice-writer \
    default-jre \
    fonts-dejavu \
    fonts-liberation \
    libxinerama1 \
    libxrandr2 \
    libxrender1 \
    libxt6 \
    libcups2 \
    libdbus-1-3 \
    libglib2.0-0 \
    libsm6 \
    libice6 \
    libx11-6 \
    libxext6 \
    libnss3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------
# App directory
# -----------------------------
WORKDIR /app

# -----------------------------
# Install Node dependencies
# -----------------------------
COPY package*.json ./
RUN npm install --omit=dev

# -----------------------------
# Copy source
# -----------------------------
COPY . .

# -----------------------------
# Ensure upload/output folders exist
# -----------------------------
RUN mkdir -p uploads output

# -----------------------------
# Expose port
# -----------------------------
EXPOSE 3000

# -----------------------------
# Start server
# -----------------------------
CMD ["node", "server.js"]
