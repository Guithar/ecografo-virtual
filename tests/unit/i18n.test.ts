import { describe, expect, it } from 'vitest';
import en from '../../en/index.html?raw';
import es from '../../index.html?raw';
import { LANG, tr } from '../../src/i18n';

const all = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);
const ids = (html: string) => all(html, /\sid="([^"]+)"/g);
const dataAttrs = (html: string) => all(html, /\s(data-[a-z-]+(?:="[^"]*")?)/g);
const values = (html: string) => all(html, /\svalue="([^"]*)"/g);
const head = (html: string, re: RegExp) => html.match(re)?.[1];

describe('páginas en español (/) e inglés (/en/)', () => {
  it('tienen los mismos elementos con id, en el mismo orden', () => {
    expect(ids(en)).toEqual(ids(es));
  });

  it('tienen los mismos atributos data-* y valores de opciones', () => {
    expect(dataAttrs(en)).toEqual(dataAttrs(es));
    expect(values(en)).toEqual(values(es));
  });

  it('declaran su idioma, su URL canónica y la otra versión', () => {
    expect(head(es, /<html lang="([^"]+)"/)).toBe('es');
    expect(head(en, /<html lang="([^"]+)"/)).toBe('en');
    expect(head(es, /rel="canonical" href="([^"]+)"/)).toBe('https://fistulab.com/');
    expect(head(en, /rel="canonical" href="([^"]+)"/)).toBe('https://fistulab.com/en/');
    for (const html of [es, en]) {
      expect(html).toContain('hreflang="es" href="https://fistulab.com/"');
      expect(html).toContain('hreflang="en" href="https://fistulab.com/en/"');
      expect(html).toContain('hreflang="x-default" href="https://fistulab.com/"');
    }
  });

  it('tienen datos estructurados válidos (JSON)', () => {
    for (const html of [es, en]) {
      const json = head(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(() => JSON.parse(json ?? '')).not.toThrow();
    }
  });
});

describe('textos', () => {
  it('sin documento (pruebas, Node) el idioma es el español', () => {
    expect(LANG).toBe('es');
    expect(tr('Sonda', 'Probe')).toBe('Sonda');
  });
});
