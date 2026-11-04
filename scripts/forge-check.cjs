#!/usr/bin/env node
// Validates a Forge app's manifest and bundles its functions and UI Kit resources with the Forge
// CLI's own validator and bundler. Needs no Atlassian login, so it runs in CI.
//
//   node scripts/forge-check.cjs apps/forge
//
// Finds the Forge CLI in FORGE_CLI_DIR, or in the global npm folder (npm install -g @forge/cli).
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const appDir = path.resolve(process.argv[2] || ".");
const cliDir =
  process.env.FORGE_CLI_DIR ||
  path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "@forge", "cli");
if (!fs.existsSync(path.join(cliDir, "package.json"))) {
  console.error(`Forge CLI not found at ${cliDir}. Run: npm install -g @forge/cli`);
  process.exit(2);
}
const load = (name) => require(require.resolve(name, { paths: [cliDir] }));
const manifestLib = load("@forge/manifest");
const bundler = load("@forge/bundler");
const yaml = load("yaml");

const quiet = {
  info() {},
  debug() {},
  trace() {},
  warn: (m) => console.log("  warning:", m),
  error: (m) => console.log("  error:", m),
};
// The real runtime wrapper is downloaded at deploy time. It isn't needed to prove the code bundles.
const stub = { script: "", source: "stub", version: "0.0.0" };
const wrapper = { getNodeRuntimeWrapper: async () => stub, getNodeRuntimeLoader: async () => stub };

async function main() {
  process.chdir(appDir);
  const version = require(path.join(cliDir, "package.json")).version;
  console.log(
    `Forge CLI ${version}, app ${path.relative(process.cwd() + "/../..", appDir) || appDir}`,
  );

  const result = await manifestLib.validate(false, path.join(appDir, "manifest.yml"));
  if (!result.success) {
    console.log("Manifest: INVALID");
    for (const e of result.errors || []) console.log(`  ${e.level || "error"}: ${e.message}`);
    process.exit(1);
  }
  console.log("Manifest: valid");

  const manifest = yaml.parse(fs.readFileSync("manifest.yml", "utf8"));
  const handlers = (manifest.modules.function || []).map((f) => ({
    module: f.handler.split(".")[0],
  }));
  const node = bundler.getNodeBundler(quiet, wrapper, { readConfig: async () => manifest });
  const backend = await node.bundle({
    appDirectory: appDir,
    entryPoints: bundler.getEntryPoints(handlers),
  });
  const size = (dir, file) => `${Math.round(fs.statSync(path.join(dir, file)).size / 1024)} KB`;
  console.log(`Backend bundle: ok (index.cjs ${size(backend.outputDir, "index.cjs")})`);

  const ui = new bundler.NativeUIBundler(quiet);
  for (const r of (manifest.resources || []).filter((r) => /\.(t|j)sx?$/.test(r.path))) {
    const out = await ui.bundle({
      appDirectory: appDir,
      entryPoints: bundler.createEntryPointsForResource(r.key, r.path),
    });
    console.log(`UI bundle ${r.key}: ok (${size(out.outputDir, `${r.key}.js`)})`);
  }
}

main().catch((error) => {
  console.log("Bundle: FAILED");
  console.log(
    String((error && (error.message || error)) || error)
      .split("\n")
      .slice(0, 15)
      .join("\n"),
  );
  process.exit(1);
});
