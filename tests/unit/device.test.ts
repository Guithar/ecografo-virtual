import { describe, expect, it } from 'vitest';
import { LESSONS } from '../../src/training/lessons';
import { deviceText, forcedCompact } from '../../src/ui/device';

describe('textos según el dispositivo', () => {
  it('elige la variante de escritorio o la táctil', () => {
    const s = 'Coloca la sonda {{(tecla 1)|(botón <b>Transv.</b>)}} y avanza {{(↑)|}}.';
    expect(deviceText(s, false)).toBe('Coloca la sonda (tecla 1) y avanza (↑).');
    expect(deviceText(s, true)).toBe('Coloca la sonda (botón <b>Transv.</b>) y avanza .');
  });

  it('deja intacto el texto sin variantes', () => {
    expect(deviceText('Centra la vena <b>en transversal</b>.', true)).toBe('Centra la vena <b>en transversal</b>.');
  });

  it('las lecciones no dejan marcas sin resolver ni teclas en la versión táctil', () => {
    for (const l of LESSONS) {
      for (const st of l.steps) {
        for (const raw of [st.text, st.hint ?? '']) {
          const touch = deviceText(raw, true);
          expect(touch).not.toMatch(/\{\{|\}\}/);
          expect(touch).not.toMatch(/\btecla\b|barra espaciadora|\b[WASDQERFZXK]\/[WASDQERFZXK]\b|\(\s*[WASDQERFZXK]\s*\)|PgDn|AvPág/);
          expect(deviceText(raw, false)).not.toMatch(/\{\{|\}\}/);
        }
      }
    }
  });
});

describe('interfaz forzada por la URL', () => {
  it('?movil=1 fuerza la interfaz móvil y ?movil=0 la de escritorio', () => {
    expect(forcedCompact('?movil=1')).toBe(true);
    expect(forcedCompact('?caso=rc_madura&movil=0')).toBe(false);
    expect(forcedCompact('?caso=rc_madura')).toBeNull();
  });
});
