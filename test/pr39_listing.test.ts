import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { writeListing } from '../src/formats/writeListing.js';
import type { ListingArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe.skip('PR39 listing (.lst) artifact', () => {
  it('emits a deterministic byte-dump listing by default', async () => {
    const entry = join(__dirname, 'fixtures', 'pr2_const_data.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const lst = res.artifacts.find((a): a is ListingArtifact => a.kind === 'lst');
    expect(lst).toBeDefined();

    expect(lst!.text).toContain('; ZAX listing');
    expect(lst!.text).toContain('0000: 3E 05 C9 .. 48 45 4C 4C 4F');
    expect(lst!.text).toContain('|>.. HELLO...|');
    expect(lst!.text).toMatch(/;\s+data\s+msg\s+=\s+\$0004/);
    expect(lst!.text).toMatch(/;\s+constant\s+MsgLen\s+=\s+\$0005\s+\(5\)/);
  });

  it('allows suppressing listing without changing other defaults', async () => {
    const entry = join(__dirname, 'fixtures', 'pr1_minimal.zax');
    const res = await compile(entry, { emitListing: false }, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const lst = res.artifacts.find((a): a is ListingArtifact => a.kind === 'lst');
    expect(lst).toBeUndefined();
  });

  it('renders sparse gaps as .. with deterministic ascii gutter', () => {
    const map = {
      bytes: new Map<number, number>([
        [0x1000, 0x41],
        [0x1002, 0x42],
      ]),
    };
    const out = writeListing(map, [], { bytesPerLine: 4 });
    expect(out.text).toContain('1000: 41 .. 42     |A B|');
  });

  it('compresses full-line sparse gaps with a deterministic marker', () => {
    const map = {
      bytes: new Map<number, number>([
        [0x1000, 0x41],
        [0x1020, 0x42],
      ]),
    };
    const out = writeListing(map, [], { bytesPerLine: 16 });
    expect(out.text).toContain('1000: 41');
    expect(out.text).toContain('; ... gap $1010..$101F (1 lines)');
    expect(out.text).toContain('1020: 42');
  });

  it('preserves sparse lines at segment edges and collapses middle full-line gaps', () => {
    const map = {
      bytes: new Map<number, number>([
        [0x100f, 0x41],
        [0x1020, 0x42],
      ]),
    };
    const out = writeListing(map, [], { bytesPerLine: 16 });
    expect(out.text).toContain('1000:');
    expect(out.text).toContain('1000: .. .. .. .. .. .. .. .. .. .. .. .. .. .. .. 41');
    expect(out.text).toContain('; ... gap $1010..$101F (1 lines)');
    expect(out.text).toContain('1020: 42');
  });
});
