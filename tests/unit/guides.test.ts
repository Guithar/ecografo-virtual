import { describe, expect, it } from 'vitest';
import { ALL_PAGES, GUIDE_INDEX, GUIDES, SITE_ORIGIN } from '../../src/guides/pages';

// todas las páginas HTML del sitio, por ruta (guias/x/index.html → 'guias/x/')
const files = import.meta.glob(['../../index.html', '../../en/index.html', '../../guias/**/index.html', '../../en/guides/**/index.html'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const byPath = new Map(Object.entries(files).map(([f, html]) => [f.replace('../../', '').replace(/index\.html$/, ''), html]));
const known = new Set(ALL_PAGES.flatMap((p) => [p.es, p.en]));
const attr = (html: string, re: RegExp) => html.match(re)?.[1];

describe('guías', () => {
  it('cada página de la lista existe y no queda ninguna fuera de la lista', () => {
    for (const p of known) expect(byPath.has(p), `falta ${p}index.html`).toBe(true);
    for (const p of byPath.keys()) expect(known.has(p), `${p}index.html no está en src/guides/pages.ts`).toBe(true);
  });

  for (const pair of [GUIDE_INDEX, ...GUIDES]) {
    for (const lang of ['es', 'en'] as const) {
      const path = pair[lang];
      it(`${path}: idioma, canónica, hreflang y datos estructurados`, () => {
        const html = byPath.get(path)!;
        expect(attr(html, /<html lang="([^"]+)"/)).toBe(lang);
        expect(attr(html, /rel="canonical" href="([^"]+)"/)).toBe(SITE_ORIGIN + path);
        expect(html).toContain(`hreflang="es" href="${SITE_ORIGIN}${pair.es}"`);
        expect(html).toContain(`hreflang="en" href="${SITE_ORIGIN}${pair.en}"`);
        expect(html).toContain(`hreflang="x-default" href="${SITE_ORIGIN}${pair.es}"`);
        expect(html).not.toContain('{{');
        expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
        const title = attr(html, /<title>([^<]+)<\/title>/) ?? '';
        expect(title.length).toBeGreaterThan(20);
        expect(title.length).toBeLessThanOrEqual(70);
        const json = attr(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        expect(() => JSON.parse(json ?? '')).not.toThrow();
        // el selector de idioma lleva a la otra versión
        const other = lang === 'es' ? pair.en : pair.es;
        expect(html).toMatch(new RegExp(`class="lang" href="/${other.replace(/\//g, '\\/')}"`));
      });

      it(`${path}: los enlaces internos llevan a páginas que existen`, () => {
        const html = byPath.get(path)!;
        for (const [, href] of html.matchAll(/<a [^>]*href="(\/[^"]*)"/g)) {
          const clean = href.slice(1).split(/[?#]/)[0];
          expect(known.has(clean), `${path} enlaza a /${clean}`).toBe(true);
        }
      });
    }
  }
});
