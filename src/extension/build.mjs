import { build, context } from "esbuild";

/**
 * Bundles the VS Code extension into a single CommonJS file.
 *
 * The parser core (../parser) is imported by relative `.ts` path and inlined
 * here, along with its `yaml` dependency — so the extension reuses the exact
 * same expiry logic the CLI and tests use, with no separate build step. The
 * parser only touches node:fs / node:path, which are available in the VS Code
 * extension host, so nothing Bun-specific leaks in.
 */
const options = {
  entryPoints: ["src/extension.ts"],
  outfile: "out/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  // `vscode` is provided by the extension host at runtime, never bundled.
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

const watch = process.argv.includes("--watch");

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("esbuild: watching for changes…");
} else {
  await build(options);
}
