import { describe, expect, it } from 'vitest';
import workflow from '../../.github/workflows/deploy.yml?raw';

// archivos de clave de IndexNow publicados en la raíz del sitio (public/<clave>.txt)
const keyFiles = import.meta.glob('../../public/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('IndexNow', () => {
  it('la clave del flujo de publicación está publicada en public/<clave>.txt', () => {
    const key = workflow.match(/INDEXNOW_KEY:\s*([0-9a-f]{8,128})/)?.[1];
    expect(key).toBeDefined();
    const file = Object.entries(keyFiles).find(([path]) => path.endsWith(`/${key}.txt`));
    expect(file, `falta public/${key}.txt`).toBeDefined();
    expect(file![1].trim()).toBe(key);
  });
});
