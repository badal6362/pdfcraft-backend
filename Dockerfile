FROM node:20

RUN apt-get update && apt-get install -y \
    libreoffice \
    libreoffice-writer \
    ghostscript \
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
    libx11-6 \
    libxext6 \
    libnss3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p uploads output

EXPOSE 3000
CMD ["node", "server.js"]
