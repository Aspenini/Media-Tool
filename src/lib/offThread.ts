/**
 * Run a self-contained function in a Web Worker, so long jobs don't freeze the page.
 *
 * The worker is built from the function's own source at runtime (the bundler here
 * can't emit separate worker files), which means the function must not reference
 * anything outside itself — no imports, no module-level constants. Keep everything
 * it needs nested inside it. Types are fine: they're erased before this runs.
 *
 * Falls back to running on the calling thread when workers aren't available.
 */
export function runOffThread<In, Out>(kernel: (input: In) => Out, input: In, transfer: Transferable[] = []): Promise<Out> {
  return new Promise<Out>((resolve, reject) => {
    let worker: Worker;
    let url: string;
    try {
      url = URL.createObjectURL(new Blob([`self.onmessage=(e)=>{const kernel=(${kernel.toString()});self.postMessage(kernel(e.data));};`], { type: 'text/javascript' }));
      worker = new Worker(url);
    } catch {
      // No worker support: do it here instead.
      try {
        resolve(kernel(input));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    const finish = (run: () => void) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      run();
    };

    worker.onmessage = (event: MessageEvent<Out>) => finish(() => resolve(event.data));
    worker.onerror = (event) => {
      event.preventDefault();
      // The worker couldn't run it; the same code still works on this thread.
      finish(() => {
        try {
          resolve(kernel(input));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    };

    try {
      worker.postMessage(input, transfer);
    } catch {
      finish(() => resolve(kernel(input)));
    }
  });
}
