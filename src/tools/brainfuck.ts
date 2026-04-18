import { showNotification } from '../ui/notification.js';

const BF_OPS = /[^+\-<>.,[\]]/g;

function stripBrainfuck(source: string): string {
  return source.replace(BF_OPS, '');
}

export function runBrainfuck(
  source: string,
  opts?: { maxSteps?: number; input?: string }
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
    if (ptr < 0) throw new RangeError('tape');
  };

  while (ip < code.length && steps < maxSteps) {
    steps++;
    const op = code[ip];
    switch (op) {
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
      default:
        break;
    }
    ip++;
  }

  if (steps >= maxSteps) {
    return { output: out, error: 'Step limit exceeded (possible infinite loop).' };
  }
  return { output: out };
}

function textToBrainfuck(text: string): string {
  let code = '';
  let prev = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    let diff = c - prev;
    if (diff > 127) diff -= 256;
    if (diff < -127) diff += 256;
    if (diff > 0) {
      code += '+'.repeat(diff);
    } else if (diff < 0) {
      code += '-'.repeat(-diff);
    }
    code += '.';
    prev = c;
  }
  return code;
}

export function initBrainfuck(): void {
  const input = document.getElementById('brainfuckInput') as HTMLTextAreaElement;
  const output = document.getElementById('brainfuckOutput') as HTMLTextAreaElement;
  const copyBtn = document.querySelector<HTMLButtonElement>('[data-brainfuck-copy]');
  const downloadBtn = document.querySelector<HTMLButtonElement>('[data-brainfuck-download]');
  const decodeInput = document.getElementById('brainfuckDecodeInput') as HTMLTextAreaElement;
  const decodeOutput = document.getElementById('brainfuckDecodeOutput') as HTMLTextAreaElement;
  const decodeBtn = document.querySelector<HTMLButtonElement>('[data-brainfuck-decode]');

  function encode(): void {
    if (output) output.value = textToBrainfuck(input?.value ?? '');
  }

  if (input) input.addEventListener('input', encode);

  if (decodeBtn && decodeOutput) {
    decodeBtn.addEventListener('click', () => {
      const src = decodeInput?.value ?? '';
      if (!stripBrainfuck(src)) {
        decodeOutput.value = '';
        showNotification('Paste Brainfuck code to run.', 'error');
        return;
      }
      try {
        const { output: text, error } = runBrainfuck(src);
        decodeOutput.value = text;
        if (error) showNotification(error, 'error');
      } catch {
        decodeOutput.value = '';
        showNotification('Runtime error while executing Brainfuck.', 'error');
      }
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (!output?.value) {
        showNotification('No code to copy!', 'error');
        return;
      }
      output.select();
      output.setSelectionRange(0, 99999);
      try {
        document.execCommand('copy');
        showNotification('Brainfuck code copied to clipboard!', 'success');
      } catch {
        navigator.clipboard.writeText(output.value).then(
          () => showNotification('Brainfuck code copied to clipboard!', 'success'),
          () => showNotification('Failed to copy code. Please select and copy manually.', 'error')
        );
      }
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      if (!output?.value) {
        showNotification('No code to download!', 'error');
        return;
      }
      const blob = new Blob([output.value], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'brainfuck_code.bf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification('Brainfuck code downloaded!', 'success');
    });
  }
}
