# Pelipalvelin konttina pilvipalvelinta varten (esim. Fly.io tai Hetzner).
# Kotikoneella palvelin ajetaan suoraan: pnpm server (ks. docs/julkaisu.md).
FROM node:22-slim
WORKDIR /app
RUN corepack enable

# Riippuvuudet ensin, jotta välimuisti säilyy koodimuutoksissa.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter @lunki/server...

COPY packages/shared packages/shared
COPY packages/server packages/server

# Ennätykset, palaute ja virheet: liitä /data pysyvään levyyn.
ENV PORT=2567 LUNKI_DB=/data/lunki.sqlite
VOLUME /data
EXPOSE 2567
WORKDIR /app/packages/server
CMD ["pnpm", "start"]
