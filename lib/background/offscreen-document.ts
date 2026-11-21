// Lifecycle of the single offscreen document that hosts Pyodide. The browser APIs are passed in so
// the logic can be tested without Chrome.

export interface OffscreenApi {
  hasDocument: () => Promise<boolean>;
  createDocument: () => Promise<void>;
  closeDocument: () => Promise<void>;
}

export interface OffscreenKeeper {
  /** Create the document unless it exists. Concurrent calls share one creation. */
  ensure: () => Promise<void>;
  /** Close the document if it exists, so the next `ensure` starts a fresh runtime. */
  close: () => Promise<void>;
}

export function createOffscreenKeeper(api: OffscreenApi): OffscreenKeeper {
  let pending: Promise<void> | undefined;

  // Checked on every call rather than cached: Chrome may close the document, and a restarted
  // service worker finds the document of its previous instance still open.
  async function create(): Promise<void> {
    if (await api.hasDocument()) return;
    try {
      await api.createDocument();
    } catch (error) {
      // Chrome allows one offscreen document; losing a race to create it is not a failure.
      if (!(await api.hasDocument())) throw error;
    }
  }

  return {
    ensure() {
      pending ??= create().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    async close() {
      if (await api.hasDocument()) await api.closeDocument();
    },
  };
}
