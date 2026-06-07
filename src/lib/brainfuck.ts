const BF_OPS = /[^+\-<>.,[\]]/g;

export function stripBrainfuck(source: string): string {
  return source.replace(BF_OPS, '');
}

export function runBrainfuck(
  source: string,
  opts?: { maxSteps?: number; input?: string },
): { output: string; error?: string } {
  const maxSteps = opts?.maxSteps ?? 5_000_000;
  const input = opts?.input ?? '';
  const code = stripBrainfuck(source);
  const stack: number[] = [];
  const jump = new Map<number, number>();
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '[') stack.push(i);
    else if (ch === ']') {
      if (!stack.length) return { output: '', error: 'Unmatched ]' };
      const open = stack.pop()!;
      jump.set(open, i);
      jump.set(i, open);
    }
  }
  if (stack.length) return { output: '', error: 'Unmatched [' };

  let tape = new Uint8Array(30_000);
  let ip = 0;
  let ptr = 15_000;
  let out = '';
  let inputPtr = 0;
  let steps = 0;

  const ensurePtr = (): void => {
    if (ptr >= tape.length) {
      const next = new Uint8Array(Math.max(tape.length * 2, ptr + 1));
      next.set(tape);
      tape = next;
    }
    if (ptr < 0) throw new RangeError('tape underflow');
  };

  while (ip < code.length && steps < maxSteps) {
    steps++;
    switch (code[ip]) {
      case '+':
        tape[ptr]++;
        break;
      case '-':
        tape[ptr]--;
        break;
      case '>':
        ptr++;
        ensurePtr();
        break;
      case '<':
        ptr--;
        ensurePtr();
        break;
      case '.':
        out += String.fromCharCode(tape[ptr]);
        break;
      case ',':
        tape[ptr] = inputPtr < input.length ? input.charCodeAt(inputPtr++) & 255 : 0;
        break;
      case '[':
        if (tape[ptr] === 0) ip = jump.get(ip)!;
        break;
      case ']':
        if (tape[ptr] !== 0) ip = jump.get(ip)!;
        break;
    }
    ip++;
  }

  if (steps >= maxSteps) return { output: out, error: 'Step limit exceeded (possible infinite loop).' };
  return { output: out };
}

export function textToBrainfuck(text: string): string {
  let code = '';
  let prev = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    let diff = c - prev;
    if (diff > 127) diff -= 256;
    if (diff < -127) diff += 256;
    if (diff > 0) code += '+'.repeat(diff);
    else if (diff < 0) code += '-'.repeat(-diff);
    code += '.';
    prev = c;
  }
  return code;
}
