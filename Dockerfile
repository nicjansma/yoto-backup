FROM node:26-alpine

WORKDIR /home

COPY package*.json /home

RUN npm install

COPY ./ /home/

CMD ["node", "backup-cards-from-web.js", "/data"]
