FROM node:20-alpine

WORKDIR /app

# התקנת client
COPY client/package*.json ./client/
RUN cd client && npm install

# התקנת server
COPY server/package*.json ./server/
RUN cd server && npm install

# העתקת קוד המקור
COPY client/ ./client/
COPY package.json ./

# בניית הפרונטאנד
RUN cd client && npm run build

COPY server/ ./server/

# תיקיית uploads
RUN mkdir -p server/uploads

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "server/src/index.js"]
