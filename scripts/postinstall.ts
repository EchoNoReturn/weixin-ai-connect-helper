import { existsSync, mkdirSync, symlinkSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

if (process.platform !== "win32") process.exit(0);

const root = resolve(import.meta.dir, "..");
const nodeModules = join(root, "node_modules");

// read workspace globs from root package.json
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
const workspaceGlobs: string[] = rootPkg.workspaces ?? [];

// expand globs (only support "dir/*" pattern)
const workspaceDirs: string[] = [];
for (const glob of workspaceGlobs) {
  const [dir, pattern] = glob.split("/*");
  if (pattern !== undefined) {
    const parent = join(root, dir!);
    if (existsSync(parent)) {
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          workspaceDirs.push(join(parent, entry.name));
        }
      }
    }
  } else {
    const full = join(root, glob);
    if (existsSync(full)) workspaceDirs.push(full);
  }
}

// link each workspace package into node_modules
for (const dir of workspaceDirs) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) continue;

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const name: string | undefined = pkg.name;
  if (!name) continue;

  // scoped: @scope/name -> node_modules/@scope/name
  const parts = name.split("/");
  const linkDir = parts.length > 1
    ? join(nodeModules, ...parts)
    : join(nodeModules, name);

  if (existsSync(linkDir)) continue;

  // ensure parent dir exists for scoped packages
  const parentDir = join(linkDir, "..");
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  try {
    symlinkSync(dir, linkDir, "junction");
    console.log(`🔗 linked ${name}`);
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      console.error(`❌ failed to link ${name}: ${err.message}`);
    }
  }
}
