FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY index.html ./index.html
COPY server.js ./server.js
COPY src ./src
COPY data ./data
COPY public ./public
EXPOSE 3000
USER node
CMD ["node", "server.js"]
