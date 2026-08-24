# 1. Base image (Lightweight Node.js version)
FROM node:18-alpine

# 2. Container ke andar working directory set karein
WORKDIR /app

# 3. Package files copy karein aur dependencies install karein
COPY package*.json ./
RUN npm install

# 4. Prisma schema copy karein aur client generate karein (Prisma ke liye zaroori hai)
COPY prisma ./prisma/
RUN npx prisma generate

# 5. Baaki ka saara code copy karein
COPY . .

# 6. Port expose karein
EXPOSE 3000

# 7. Start command (Start karne se pehle automatically DB tables push karega)
CMD ["sh", "-c", "npx prisma db push && node src/server.js"]