FROM node:22

WORKDIR /src/app
COPY package*.json ./
RUN npm install
COPY . .
CMD npm run build && npm run start