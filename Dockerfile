FROM ghcr.io/librespark/libretv:latest

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

EXPOSE 8080

CMD ["node", "server.js"]
