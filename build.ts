import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";

const PROJECT_ROOT = join(import.meta.dir, "dango");
const DIST_DIR = join(import.meta.dir, "dist");

if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR);
}

function getGitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
}

function getBuildDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()).replace(/-/g, ".");
}

async function bundle() {
  console.log("🚀 Starting build...");

  const manifest = JSON.parse(readFileSync(join(PROJECT_ROOT, "manifest.json"), "utf-8"));
  const version = manifest.version || "1.1.2";
  const buildDate = getBuildDate();
  const buildHash = getGitHash();

  console.log(`📌 Version: v${version} (${buildDate} · ${buildHash})`);

  // 1. Read index.html
  let html = readFileSync(join(PROJECT_ROOT, "index.html"), "utf-8");

  // Sync version in about card
  html = html.replace(
    /<div class="about-version">.*?<\/div>/,
    `<div class="about-version">v${version} (${buildDate})</div>`
  );

  // 2. Bundle JS
  console.log("📦 Bundling JS...");
  const entryPoint = existsSync(join(PROJECT_ROOT, "js/main.ts"))
    ? join(PROJECT_ROOT, "js/main.ts")
    : join(PROJECT_ROOT, "js/main.js");

  const jsBuild = await Bun.build({
    entrypoints: [entryPoint],
    minify: true,
    target: "browser",
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __BUILD_DATE__: JSON.stringify(buildDate),
      __BUILD_HASH__: JSON.stringify(buildHash),
    },
  });

  if (!jsBuild.success) {
    console.error("Build failed", jsBuild.logs);
    process.exit(1);
  }
  const bundledJs = await jsBuild.outputs[0].text();

  // 3. Bundle CSS
  console.log("🎨 Bundling CSS...");
  let css = readFileSync(join(PROJECT_ROOT, "css/style.css"), "utf-8");
  const importRegex = /@import url\("([^"]+)"\);/g;
  let match;
  while ((match = importRegex.exec(css)) !== null) {
    const importPath = join(PROJECT_ROOT, "css", match[1]);
    const importedCss = readFileSync(importPath, "utf-8");
    css = css.replace(match[0], importedCss);
  }
  // Simple minify
  css = css.replace(/\s+/g, " ").replace(/\/\*.*?\*\//g, "");

  // 4. Inline everything into HTML
  console.log("🔗 Inlining assets...");

  const escapeScript = (str: string) => str.replace(/<\/script>/g, '<\\/script>');

  // Inline lz-string
  const lzString = readFileSync(join(PROJECT_ROOT, "js/lz-string.min.js"), "utf-8");
  html = html.replace(
    '<script src="js/lz-string.min.js"></script>',
    () => `<script>${escapeScript(lzString)}</script>`
  );

  // Replace style link
  html = html.replace(
    '<link rel="stylesheet" href="css/style.css">',
    () => `<style>${css}</style>`
  );

  // Replace main module script
  html = html.replace(
    /<script\s+type="module"\s+src="js\/main\.(?:ts|js)"><\/script>/,
    () => `<script type="module">${escapeScript(bundledJs)}</script>`
  );

  // 5. Write to dist/index.html
  writeFileSync(join(DIST_DIR, "index.html"), html);
  console.log("✅ Build complete: dist/index.html");
}

bundle().catch(console.error);
