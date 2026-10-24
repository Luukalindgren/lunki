/** Overpass API -kyselyt usealla palvelimella ja uusintayrityksin. */
import type { OverpassResponse } from './osm';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function overpass(query: string): Promise<OverpassResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        return await post(url, query);
      } catch (e) {
        lastError = e;
        console.warn(`Overpass epäonnistui (${url}):`, e instanceof Error ? e.message : e);
      }
    }
    await sleep(10_000 * (attempt + 1));
  }
  throw lastError;
}

async function post(url: string, query: string): Promise<OverpassResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'lunki-map-pipeline (https://github.com/Luukalindgren/lunki)',
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as OverpassResponse;
}
