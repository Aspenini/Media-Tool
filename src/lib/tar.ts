export interface TarEntry {
  name: string;
  data: Uint8Array;
}

/** Build a minimal ustar archive Blob from in-memory entries (no extra deps). */
export function createTarBlob(entries: TarEntry[]): Blob {
  const blocks: BlobPart[] = [];
  const encoder = new TextEncoder();

  const writeString = (buf: Uint8Array, offset: number, str: string, length: number): void => {
    const bytes = encoder.encode(str);
    const size = Math.min(bytes.length, length);
    for (let i = 0; i < size; i++) buf[offset + i] = bytes[i];
    for (let i = size; i < length; i++) buf[offset + i] = 0;
  };

  const writeOctal = (buf: Uint8Array, offset: number, value: number, length: number): void => {
    writeString(buf, offset, value.toString(8).padStart(length - 1, '0'), length - 1);
    buf[offset + length - 1] = 0;
  };

  const splitName = (name: string): { name: string; prefix: string } => {
    if (name.length <= 100) return { name, prefix: '' };
    const idx = name.lastIndexOf('/');
    if (idx > 0 && idx < 156 && name.length - idx - 1 <= 100) {
      return { name: name.slice(idx + 1), prefix: name.slice(0, idx) };
    }
    return { name: name.slice(-100), prefix: '' };
  };

  const mtime = Math.floor(Date.now() / 1000);

  for (const { name, data } of entries) {
    const header = new Uint8Array(512);
    const parts = splitName(name);
    writeString(header, 0, parts.name, 100);
    writeString(header, 100, '0000777', 8);
    writeString(header, 108, '0000000', 8);
    writeString(header, 116, '0000000', 8);
    writeOctal(header, 124, data.length, 12);
    writeOctal(header, 136, mtime, 12);
    for (let i = 148; i < 156; i++) header[i] = 0x20;
    header[156] = 0x30;
    writeString(header, 257, 'ustar', 6);
    header[262] = 0x30;
    header[263] = 0x30;
    writeString(header, 265, 'user', 32);
    writeString(header, 297, 'group', 32);
    writeString(header, 345, parts.prefix, 155);

    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    writeString(header, 148, checksum.toString(8).padStart(6, '0'), 6);
    header[154] = 0;
    header[155] = 0x20;

    blocks.push(header.slice());
    blocks.push(data.slice());
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) blocks.push(new Uint8Array(pad));
  }

  blocks.push(new Uint8Array(512));
  blocks.push(new Uint8Array(512));
  return new Blob(blocks, { type: 'application/x-tar' });
}
