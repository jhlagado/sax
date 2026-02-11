import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR205: indexed CB destination diagnostics parity', () => {
  it('reports explicit indexed destination legality diagnostics for CB/DD/FD forms', async () => {
    const entry = join(
      __dirname,
      'fixtures',
      'pr205_indexed_cb_destination_diag_matrix_invalid.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('res indexed destination must use legacy reg8 B/C/D/E/H/L/A');
    expect(messages).toContain('res indexed destination family must match source index base');
    expect(messages).toContain('set indexed destination must use legacy reg8 B/C/D/E/H/L/A');
    expect(messages).toContain('set indexed destination family must match source index base');
    expect(messages).toContain('rl indexed destination must use legacy reg8 B/C/D/E/H/L/A');
    expect(messages).toContain('rl indexed destination family must match source index base');
    expect(messages).toContain('rrc indexed destination must use legacy reg8 B/C/D/E/H/L/A');
    expect(messages).toContain('rrc indexed destination family must match source index base');

    expect(messages).not.toContain('res b,(ix/iy+disp),r expects reg8 destination');
    expect(messages).not.toContain('set b,(ix/iy+disp),r expects reg8 destination');
    expect(messages).not.toContain('rl (ix/iy+disp),r expects reg8 destination');
    expect(messages).not.toContain('rrc (ix/iy+disp),r expects reg8 destination');
  });
});
