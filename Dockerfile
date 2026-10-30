# Pelipalvelin konttina pilvikoneelle (docs/pilvipalvelin.md, scripts/pilvi/).
# Kotikoneella palvelin ajetaan suoraan: pnpm run server (ks. docs/julkaisu.md).
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

# Palvelin kootaan yhdeksi tiedostoksi ja ajetaan suoraan nodella: pnpm + tsx
# veisivät noin kolminkertaisesti muistia (330 Mt vs. 110 Mt).
WORKDIR /app/packages/server
RUN pnpm bundle

# Ennätykset, palaute ja virheet: liitä /data pysyvään levyyn.
ENV NODE_ENV=production PORT=2567 LUNKI_DB=/data/lunki.sqlite
VOLUME /data
EXPOSE 2567
USER node
CMD ["node", "dist/index.mjs"]
