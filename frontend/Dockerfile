FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN apk upgrade --no-cache

COPY default.conf.template /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=http://api:8000/
COPY site/ /usr/share/nginx/html/

# imagem ja roda como usuario nao root (uid 101) na porta 8080
EXPOSE 8080

USER 101
