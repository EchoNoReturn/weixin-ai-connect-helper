import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Set before application modules load; tests must never write to ~/.wah.
const stateDir = mkdtempSync(join(tmpdir(), "wah-tests-"));
process.env.BRIDGE_STATE_DIR = stateDir;
process.env.OPENCLAW_STATE_DIR = stateDir;
