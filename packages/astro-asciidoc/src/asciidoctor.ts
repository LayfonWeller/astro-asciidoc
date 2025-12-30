import EventEmitter from "node:events";
import { Worker } from "node:worker_threads";
import type { InitOptions, InputMessage, OutputMessage } from "./worker.js";

export default class AsciidocConverter extends EventEmitter {
  private worker;
  private queue: Array<{
    input: InputMessage;
    resolve: (value: OutputMessage) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  private processing = false;

  constructor(opts?: InitOptions) {
    super({ captureRejections: true });
    const url = new URL("./worker.cjs", import.meta.url);
    this.worker = new Worker(url, {
      workerData: opts,
    });
    this.worker.on("exit", (code) => {
      this.emit("exit", { code });
    });
  }

  async convert(input: InputMessage): Promise<OutputMessage> {
    return new Promise((resolve, reject) => {
      this.queue.push({ input, resolve, reject });
      this.#processQueue();
    });
  }

  async #processQueue() {
    if (this.processing) return;

    const next = this.queue.shift();
    if (!next) return;

    this.processing = true;
    const { input, resolve, reject } = next;

    const onMessage = (msg: OutputMessage) => {
      cleanup();
      resolve(msg);
      this.processing = false;
      this.#processQueue();
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
      this.processing = false;
      this.#processQueue();
    };

    const cleanup = () => {
      this.worker.removeListener("message", onMessage);
      this.worker.removeListener("error", onError);
    };

    this.worker.on("message", onMessage).on("error", onError).postMessage(input);
  }

  async terminate() {
    return this.worker.terminate();
  }
}
