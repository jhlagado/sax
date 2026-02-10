import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR124 ISA: jp/call condition-code matrix', () => {
  it('encodes unconditional and conditional jp/call imm16 forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr124_control_flow_cc_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xc3,
        0x34,
        0x12, // jp $1234
        0xcd,
        0x45,
        0x23, // call $2345
        0xc2,
        0x00,
        0x10, // jp nz,$1000
        0xca,
        0x01,
        0x10, // jp z,$1001
        0xd2,
        0x02,
        0x10, // jp nc,$1002
        0xda,
        0x03,
        0x10, // jp c,$1003
        0xe2,
        0x04,
        0x10, // jp po,$1004
        0xea,
        0x05,
        0x10, // jp pe,$1005
        0xf2,
        0x06,
        0x10, // jp p,$1006
        0xfa,
        0x07,
        0x10, // jp m,$1007
        0xc4,
        0x00,
        0x20, // call nz,$2000
        0xcc,
        0x01,
        0x20, // call z,$2001
        0xd4,
        0x02,
        0x20, // call nc,$2002
        0xdc,
        0x03,
        0x20, // call c,$2003
        0xe4,
        0x04,
        0x20, // call po,$2004
        0xec,
        0x05,
        0x20, // call pe,$2005
        0xf4,
        0x06,
        0x20, // call p,$2006
        0xfc,
        0x07,
        0x20, // call m,$2007
        0xc9, // ret (implicit epilogue)
      ),
    );
  });

  it('diagnoses invalid condition codes', async () => {
    const entry = join(__dirname, 'fixtures', 'pr124_control_flow_cc_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('expects condition'))).toBe(true);
  });
});
