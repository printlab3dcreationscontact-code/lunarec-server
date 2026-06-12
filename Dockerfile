FROM node:20

# Dépendances système nécessaires
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installer dépendances
COPY package*.json ./
RUN npm install

# Copier le projet
COPY . .

# Railway fournit le port via PORT
ENV PORT=3000
EXPOSE 3000

# Démarrage
CMD ["npm", "start"]