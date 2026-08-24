/** Loads Monaco on demand from a CDN, so the reading path never pays for the editor. */

const MONACO_VERSION = "0.54.0";
const MONACO_BASE = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min`;

export interface MonacoRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface MonacoTextModel {
  getValueInRange(range: MonacoRange): string;
}

export interface MonacoEditor {
  getValue(): string;
  getModel(): MonacoTextModel | null;
  getSelection(): MonacoRange | null;
  executeEdits(source: string, edits: { range: MonacoRange; text: string }[]): boolean;
  addCommand(keybinding: number, handler: () => void): void;
  focus(): void;
  layout(): void;
  dispose(): void;
}

export interface MonacoApi {
  editor: {
    create(container: HTMLElement, options: Record<string, unknown>): MonacoEditor;
  };
  KeyMod: { CtrlCmd: number };
  KeyCode: { KeyB: number; KeyI: number; KeyK: number };
}

interface AmdRequire {
  (modules: string[], onLoad: () => void, onError?: (err: unknown) => void): void;
  config(options: { paths: Record<string, string> }): void;
}

declare global {
  interface Window {
    require?: AmdRequire;
    monaco?: MonacoApi;
    MonacoEnvironment?: { getWorkerUrl(moduleId: string, label: string): string };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

let monacoPromise: Promise<MonacoApi> | null = null;

export function loadMonaco(): Promise<MonacoApi> {
  if (monacoPromise) return monacoPromise;

  monacoPromise = (async () => {
    await loadScript(`${MONACO_BASE}/vs/loader.js`);

    const amdRequire = window.require;
    if (!amdRequire) throw new Error("Monaco's AMD loader did not register itself.");

    amdRequire.config({ paths: { vs: `${MONACO_BASE}/vs` } });

    // Workers can't load cross-origin, so a same-origin blob importScripts() the CDN copy.
    window.MonacoEnvironment = {
      getWorkerUrl() {
        const bootstrap = `self.MonacoEnvironment = { baseUrl: '${MONACO_BASE}/' };
importScripts('${MONACO_BASE}/vs/base/worker/workerMain.js');`;
        return `data:text/javascript;charset=utf-8,${encodeURIComponent(bootstrap)}`;
      },
    };

    await new Promise<void>((resolve, reject) => {
      amdRequire(["vs/editor/editor.main"], () => resolve(), reject);
    });

    if (!window.monaco) throw new Error("Monaco loaded but did not define window.monaco.");
    return window.monaco;
  })();

  return monacoPromise;
}
