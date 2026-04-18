import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const PROJECT_ROOT = join(import.meta.dir, "dango");
const DIST_DIR = join(import.meta.dir, "dist");

if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR);
}

async function bundle() {
  console.log("🚀 Starting build...");

  // 1. Read index.html
  let html = readFileSync(join(PROJECT_ROOT, "index.html"), "utf-8");

  // 2. Bundle JS
  console.log("📦 Bundling JS...");
  const jsBuild = await Bun.build({
    entrypoints: [join(PROJECT_ROOT, "js/main.js")],
    minify: true,
    target: "browser",
  });

  if (!jsBuild.success) {
    console.error("Build failed", jsBuild.logs);
    return;
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
    '<script type="module" src="js/main.js"></script>',
    () => `<script type="module">${escapeScript(bundledJs)}</script>`
  );

  // 5. Write to dist/index.html
  writeFileSync(join(DIST_DIR, "index.html"), html);
  console.log("✅ Build complete: dist/index.html");
}

bundle().catch(console.error);
