FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN apk upgrade --no-cache

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html

# imagem ja roda como usuario nao root (uid 101) na porta 8080
EXPOSE 8080

USER 101
