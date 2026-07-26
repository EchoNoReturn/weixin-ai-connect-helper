import "./env.ts";
import { startBridge } from "./bridge.ts";

const abort = new AbortController();
process.on("SIGINT", () => abort.abort());
process.on("SIGTERM", () => abort.abort());

const bridge = await startBridge({ abortSignal: abort.signal });
await bridge.loopPromise;
