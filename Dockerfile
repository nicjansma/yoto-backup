FROM node:20-alpine

WORKDIR /home

COPY package*.json /home

RUN npm install

COPY ./ /home/

CMD ["node", "backup-cards-from-web.js", "/data"]
