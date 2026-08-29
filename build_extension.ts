import { join, dirname } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { execSync } from "child_process";
import zlib from "node:zlib";

const ROOT_DIR = import.meta.dir;
const PROJECT_ROOT = join(ROOT_DIR, "dango");
const DIST_DIR = join(ROOT_DIR, "dist");

if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR, { recursive: true });
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

// 递归收集目录下所有文件
function collectDirFiles(dirPath: string, relativePrefix: string = ""): Array<{ name: string; data: Buffer }> {
  const result: Array<{ name: string; data: Buffer }> = [];
  if (!existsSync(dirPath)) return result;

  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...collectDirFiles(fullPath, relPath));
    } else if (entry.isFile()) {
      result.push({ name: relPath, data: readFileSync(fullPath) });
    }
  }
  return result;
}

// 纯原生零依赖 ZIP 打包生成器
function createZip(files: Array<{ name: string; data: Buffer | string }>): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name.replace(/\\/g, "/"), "utf8");
    const rawData = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8");
    const crc = zlib.crc32(rawData);
    const compressed = zlib.deflateRawSync(rawData);

    // Local Header
    const localHdr = Buffer.alloc(30 + nameBuf.length);
    localHdr.writeUInt32LE(0x04034b50, 0);
    localHdr.writeUInt16LE(20, 4);
    localHdr.writeUInt16LE(0x0800, 6); // UTF-8
    localHdr.writeUInt16LE(8, 8); // Deflate
    localHdr.writeUInt16LE(0, 10);
    localHdr.writeUInt16LE(0, 12);
    localHdr.writeUInt32LE(crc, 14);
    localHdr.writeUInt32LE(compressed.length, 18);
    localHdr.writeUInt32LE(rawData.length, 22);
    localHdr.writeUInt16LE(nameBuf.length, 26);
    localHdr.writeUInt16LE(0, 28);
    nameBuf.copy(localHdr, 30);

    localHeaders.push(localHdr, compressed);

    // Central Directory Header
    const centralHdr = Buffer.alloc(46 + nameBuf.length);
    centralHdr.writeUInt32LE(0x02014b50, 0);
    centralHdr.writeUInt16LE(20, 4);
    centralHdr.writeUInt16LE(20, 6);
    centralHdr.writeUInt16LE(0x0800, 8);
    centralHdr.writeUInt16LE(8, 10);
    centralHdr.writeUInt16LE(0, 12);
    centralHdr.writeUInt16LE(0, 14);
    centralHdr.writeUInt32LE(crc, 16);
    centralHdr.writeUInt32LE(compressed.length, 20);
    centralHdr.writeUInt32LE(rawData.length, 24);
    centralHdr.writeUInt16LE(nameBuf.length, 28);
    centralHdr.writeUInt16LE(0, 30);
    centralHdr.writeUInt16LE(0, 32);
    centralHdr.writeUInt16LE(0, 34);
    centralHdr.writeUInt16LE(0, 36);
    centralHdr.writeUInt32LE(0, 38);
    centralHdr.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHdr, 46);

    centralHeaders.push(centralHdr);
    offset += localHdr.length + compressed.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const h of centralHeaders) centralDirSize += h.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

async function buildExtension() {
  console.log("📦 Building Dango browser extensions (CSP-compliant)...");

  // 读取基础资源与版本号
  const baseManifest = JSON.parse(readFileSync(join(PROJECT_ROOT, "manifest.json"), "utf-8"));
  const version = baseManifest.version || "0.0.0";
  const buildDate = getBuildDate();
  const buildHash = getGitHash();

  console.log(`📌 Extension Version: v${version} (${buildDate} · ${buildHash})`);

  // 1. 编译 JS (打包 main.ts 并合并 lz-string)
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
  const lzString = readFileSync(join(PROJECT_ROOT, "js/lz-string.min.js"), "utf-8");
  const extensionJs = `${lzString}\n;\n${bundledJs}`;

  // 2. 编译 CSS
  let css = readFileSync(join(PROJECT_ROOT, "css/style.css"), "utf-8");
  const importRegex = /@import url\("([^"]+)"\);/g;
  let match;
  while ((match = importRegex.exec(css)) !== null) {
    const importPath = join(PROJECT_ROOT, "css", match[1]);
    const importedCss = readFileSync(importPath, "utf-8");
    css = css.replace(match[0], importedCss);
  }
  css = css.replace(/\s+/g, " ").replace(/\/\*.*?\*\//g, "");

  // 3. 构建符合 CSP 规范的 index.html (无内联 script，使用外部 bundle.js)
  let rawHtml = readFileSync(join(PROJECT_ROOT, "index.html"), "utf-8");
  // 移除原始 lz-string 标签
  rawHtml = rawHtml.replace('<script src="js/lz-string.min.js"></script>', '');
  // 内联样式
  rawHtml = rawHtml.replace('<link rel="stylesheet" href="css/style.css">', `<style>${css}</style>`);
  // 替换 main script 引用为外部同源 bundle.js
  rawHtml = rawHtml.replace(
    /<script\s+type="module"\s+src="js\/main\.(?:ts|js)"><\/script>/,
    '<script type="module" src="bundle.js"></script>'
  );
  // 同步关于卡片的版本号
  rawHtml = rawHtml.replace(
    /<div class="about-version">.*?<\/div>/,
    `<div class="about-version">v${version} (${buildDate})</div>`
  );

  // 4. 读取基础资源
  const backgroundJs = readFileSync(join(PROJECT_ROOT, "background.js"), "utf-8");
  const iconFiles = collectDirFiles(join(PROJECT_ROOT, "icons"), "icons");
  const localeFiles = collectDirFiles(join(PROJECT_ROOT, "_locales"), "_locales");

  // ==========================================
  // A. Firefox Extension (Manifest V2)
  // ==========================================
  console.log("🦊 Packaging Firefox Extension (MV2)...");
  const firefoxManifest = {
    manifest_version: 2,
    name: "__MSG_appName__",
    version: version,
    description: "__MSG_appDesc__",
    default_locale: "en",
    icons: {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    },
    browser_action: {
      default_title: "__MSG_appName__"
    },
    background: {
      scripts: ["background.js"]
    },
    permissions: ["tabs"],
    browser_specific_settings: {
      gecko: {
        id: "dango-board@dango.ink",
        strict_min_version: "58.0",
        data_collection_permissions: {
          required: ["none"]
        }
      }
    }
  };

  const firefoxFiles: Array<{ name: string; data: Buffer | string }> = [
    { name: "manifest.json", data: JSON.stringify(firefoxManifest, null, 2) },
    { name: "background.js", data: backgroundJs },
    { name: "bundle.js", data: extensionJs },
    { name: "index.html", data: rawHtml },
    ...iconFiles,
    ...localeFiles
  ];

  // 输出解压目录
  const ffDir = join(DIST_DIR, "extension-firefox");
  if (!existsSync(ffDir)) mkdirSync(ffDir, { recursive: true });
  for (const f of firefoxFiles) {
    const target = join(ffDir, f.name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.data);
  }

  // 输出 ZIP
  const ffZip = createZip(firefoxFiles);
  writeFileSync(join(DIST_DIR, "dango-firefox.zip"), ffZip);
  console.log("✅ Firefox extension ready: dist/dango-firefox.zip (and dist/extension-firefox/)");

  // ==========================================
  // B. Chrome / Chromium / Helium Extension (Manifest V3)
  // ==========================================
  console.log("🌐 Packaging Chrome / Helium Extension (MV3)...");
  const chromeManifest = {
    manifest_version: 3,
    name: "__MSG_appName__",
    version: version,
    description: "__MSG_appDesc__",
    default_locale: "en",
    icons: {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    },
    action: {
      default_title: "__MSG_appName__"
    },
    background: {
      service_worker: "background.js"
    },
    permissions: ["tabs"]
  };

  const chromeFiles: Array<{ name: string; data: Buffer | string }> = [
    { name: "manifest.json", data: JSON.stringify(chromeManifest, null, 2) },
    { name: "background.js", data: backgroundJs },
    { name: "bundle.js", data: extensionJs },
    { name: "index.html", data: rawHtml },
    ...iconFiles,
    ...localeFiles
  ];

  // 输出解压目录
  const chromeDir = join(DIST_DIR, "extension-chrome");
  if (!existsSync(chromeDir)) mkdirSync(chromeDir, { recursive: true });
  for (const f of chromeFiles) {
    const target = join(chromeDir, f.name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.data);
  }

  // 输出 ZIP
  const chromeZip = createZip(chromeFiles);
  writeFileSync(join(DIST_DIR, "dango-chrome.zip"), chromeZip);
  console.log("✅ Chrome/Helium extension ready: dist/dango-chrome.zip (and dist/extension-chrome/)");

  console.log("\n🎉 All extensions built successfully!");
  console.log("👉 For Helium/Chrome: Open chrome://extensions -> Developer mode -> 'Load unpacked' -> select dist/extension-chrome");
  console.log("👉 For Firefox: Open about:debugging#/runtime/this-firefox -> 'Load Temporary Add-on' -> select dist/extension-firefox/manifest.json");
  console.log("👉 For Firefox AMO Upload: Use dist/dango-firefox.zip");
}

buildExtension().catch(console.error);
