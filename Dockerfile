FROM node:20-slim

# Install Ghostscript (PDF compress) + LibreOffice (DOC → PDF)
RUN apt-get update && \
    apt-get install -y ghostscript libreoffice && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
