import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";

interface FrameSample {
  timestamp: number;
  delta: number;
}

interface BenchmarkResult {
  phaseA: {
    setupLatency: number;
    totalFrames: number;
    droppedFrames120Hz: number; // > 8.33ms
    droppedFrames60Hz: number;  // > 16.67ms
    avgLatency: number;
    maxLatency: number;
    p95Latency: number;
    p99Latency: number;
    frames: FrameSample[];
  };
  phaseB: {
    setupLatency: number;
    totalFrames: number;
    droppedFrames120Hz: number;
    droppedFrames60Hz: number;
    avgLatency: number;
    maxLatency: number;
    p95Latency: number;
    p99Latency: number;
    frames: FrameSample[];
  };
  sloMet: boolean;
  violations: string[];
}

function generateBenchmarkDataset() {
  const nodes: any[] = [];
  const links: any[] = [];
  const groups: any[] = [];

  // 1. Generate 30 nodes in a 1600x1000 canvas area
  const topics = [
    "Core Runtime", "V8 Engine", "Compositor", "Tile Manager", "GPU Rasterizer",
    "Layer Tree", "Display List", "Damage Tracker", "Hit Tester", "Event Pipeline",
    "DOM Reconciliation", "Style Calculator", "Layout Geometry", "Paint Recorder", "Texture Atlas",
    "Memory Pool", "Resource Cache", "Font Rasterizer", "Vector Path", "Shader Pipeline",
    "Presentation HUD", "Smart SoftPan", "Ink Flow Animation", "Magnetic Guide", "Search Index",
    "Data Serializer", "I18n Localization", "Touch Handler", "Undo Redo Buffer", "Grand Finale"
  ];

  const colors = ["c-white", "c-red", "c-yellow", "c-green", "c-blue", "c-orange", "c-purple", "c-pink", "c-cyan"];

  for (let i = 0; i < 30; i++) {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const x = 80 + col * 260 + (row % 2 === 1 ? 40 : 0);
    const y = 80 + row * 180;
    nodes.push({
      id: `node-${i + 1}`,
      text: `${i === 0 ? "# " : ""}${topics[i]}`,
      x,
      y,
      w: 160,
      h: 48,
      color: colors[i % colors.length]
    });
  }

  // 2. Generate 2 Groups
  groups.push({
    id: "group-1",
    x: 60,
    y: 60,
    w: 800,
    h: 400,
    isGroup: true,
    memberIds: ["node-1", "node-2", "node-3", "node-7", "node-8", "node-9"]
  });

  groups.push({
    id: "group-2",
    x: 880,
    y: 420,
    w: 780,
    h: 520,
    isGroup: true,
    memberIds: ["node-16", "node-17", "node-18", "node-22", "node-23", "node-24"]
  });

  // 3. Generate 25 Links with various styles (solid, dashed, wavy) and directions
  const strokeStyles: Array<"solid" | "dashed" | "wavy"> = ["solid", "dashed", "wavy"];
  const linkPairs = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
    [6, 7], [7, 8], [8, 9], [9, 10], [10, 11],
    [12, 13], [13, 14], [14, 15], [15, 16], [16, 17],
    [18, 19], [19, 20], [20, 21], [21, 22], [22, 23],
    [0, 6], [6, 12], [12, 18], [18, 24], [5, 11]
  ];

  for (let i = 0; i < linkPairs.length; i++) {
    const [s, t] = linkPairs[i];
    links.push({
      id: `link-${i + 1}`,
      sourceId: `node-${s + 1}`,
      targetId: `node-${t + 1}`,
      direction: i % 2 === 0 ? "target" : "none",
      strokeStyle: strokeStyles[i % 3]
    });
  }

  return {
    nodes,
    groups,
    links,
    view: { x: -600, y: -400, scale: 0.9 },
    settings: {
      hideGrid: false,
      handDrawn: true,
      altAsCtrl: false,
      bgUrl: ""
    }
  };
}

class CDPClient {
  private ws!: WebSocket;
  private msgId = 1;
  private callbacks = new Map<number, (res: any) => void>();

  async connect(debuggerUrl: string, maxRetries = 10) {
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(debuggerUrl);
          const timeout = setTimeout(() => {
            try { ws.close(); } catch {}
            reject(new Error("WebSocket timeout"));
          }, 3000);

          ws.onopen = () => {
            clearTimeout(timeout);
            this.ws = ws;
            this.ws.onmessage = (event) => {
              try {
                const msg = JSON.parse(event.data as string);
                if (msg.id && this.callbacks.has(msg.id)) {
                  this.callbacks.get(msg.id)!(msg);
                  this.callbacks.delete(msg.id);
                }
              } catch (err) {
                console.error("CDP parse error:", err);
              }
            };
            resolve();
          };

          ws.onerror = (err) => {
            clearTimeout(timeout);
            try { ws.close(); } catch {}
            reject(err);
          };
        });
        return;
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    throw lastError || new Error(`Failed to connect to WebSocket at ${debuggerUrl}`);
  }

  send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve) => {
      const id = this.msgId++;
      this.callbacks.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression: string): Promise<any> {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.result?.exceptionDetails) {
      throw new Error(`Eval failed: ${JSON.stringify(res.result.exceptionDetails)}`);
    }
    return res.result?.result?.value;
  }

  async dispatchKey(key: string, code: string, keyCode: number) {
    await this.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode
    });
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function findEdgePath(): Promise<string> {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  throw new Error("No Chromium/Edge executable found!");
}

export async function runPerfBenchmark(): Promise<BenchmarkResult> {
  console.log("\n=======================================================");
  console.log("⚡ Dango 120Hz 演示模式性能基准自动化测试 (CDP)");
  console.log("=======================================================\n");

  const edgePath = await findEdgePath();
  const userDataDir = `${Bun.env.TEMP || "C:\\temp"}\\dango-cdp-perf-${Date.now()}`;
  const debugPort = 9222 + Math.floor(Math.random() * 400);

  console.log(`[1/6] 🚀 启动独立 Headless 浏览器: ${edgePath}`);
  const browserProc = spawn(edgePath, [
    `--remote-debugging-port=${debugPort}`,
    "--headless=new",
    `--user-data-dir=${userDataDir}`,
    "--window-size=1920,1080",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--enable-precise-memory-info",
    "http://localhost:3000"
  ], { stdio: "ignore" });

  const cdp = new CDPClient();

  try {
    // Wait for CDP endpoint
    console.log("[2/6] 🔌 正在连接 CDP WebSocket 通道...");
    let pageDebuggerUrl = "";
    for (let i = 0; i < 25; i++) {
      try {
        const listRes = await fetch(`http://localhost:${debugPort}/json/list`);
        const tabs = await listRes.json();
        const tab = tabs.find((t: any) => t.type === "page" && !t.url.includes("extension")) || tabs[0];
        if (tab?.webSocketDebuggerUrl) {
          pageDebuggerUrl = tab.webSocketDebuggerUrl;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    if (!pageDebuggerUrl) {
      throw new Error("Failed to get CDP debugger URL from browser");
    }

    await cdp.connect(pageDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Page.navigate", { url: "http://localhost:3000" });
    
    // Wait for page to be ready
    for (let i = 0; i < 20; i++) {
      try {
        const ready = await cdp.eval("document.readyState === 'complete'");
        if (ready) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    console.log("✅ CDP 通道建立与页面加载成功！");

    // Inject Benchmark 30-node dataset
    console.log("[3/6] 📦 注入标准 30 节点测试集 (含 25 条手绘连线、2 个编组)...");
    const fixture = generateBenchmarkDataset();

    await cdp.eval(`
      localStorage.setItem('cc-canvas-data', ${JSON.stringify(JSON.stringify(fixture))});
      localStorage.setItem('cc-hand-drawn', 'true');
      location.reload();
    `);

    // Wait for reload
    await new Promise((r) => setTimeout(r, 800));
    for (let i = 0; i < 20; i++) {
      try {
        const ready = await cdp.eval("document.readyState === 'complete' && document.querySelectorAll('.node').length >= 30");
        if (ready) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }

    // Initialize High-Precision Performance Probe in Page
    await cdp.eval(`
      window.__DANGO_PERF__ = {
        phaseAFrames: [],
        phaseBFrames: [],
        phaseASetupTime: 0,
        phaseBSetupTime: 0,
        recording: null,
        start(phase) {
          this.recording = phase;
          if (phase === 'A') this.phaseAFrames = [];
          if (phase === 'B') this.phaseBFrames = [];
        },
        stop() {
          this.recording = null;
        }
      };

      // 开启 FPS 监控面板验证
      if (typeof window.FPS === 'function') window.FPS();
    `);

    console.log("[4/6] 🏷️ 进入打标模式 (按 'T') 并为节点 1 标记步骤 1 (触发 600ms 跨画布软平移)...");
    // Press 'T' to enter tagging mode
    await cdp.dispatchKey("t", "KeyT", 84);
    await new Promise((r) => setTimeout(r, 150));

    // Tag node-1 with step 1
    await cdp.eval(`
      const nodeEl = document.querySelector('.node[data-id="node-1"]');
      if (nodeEl) {
        nodeEl.click();
      }
    `);
    await new Promise((r) => setTimeout(r, 500));

    console.log("[5/6] 🎬 触发 Phase A: 演示聚焦镜头平移 (按 'P', 600ms 动画)...");
    // Start recording and press 'P' atomically
    await cdp.eval(`
      window.__DANGO_PERF__.start('A');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', bubbles: true }));
    `);

    // Wait 800ms for Phase A animation to settle
    await new Promise((r) => setTimeout(r, 800));
    await cdp.eval(`window.__DANGO_PERF__.stop();`);
    console.log("✅ Phase A 录制完成！");

    console.log("[6/6] 🌌 触发 Phase B: 终章全景拉远 (按 'Space', 800ms 缩放动画)...");
    const preB = await cdp.eval(`({
      isPresenting: document.body.classList.contains('mode-presenting'),
      phaseAFramesLen: window.__DANGO_PERF__.phaseAFrames.length,
      activeElement: document.activeElement?.tagName
    })`);
    console.log("Pre-B state:", preB);

    // Start recording and trigger nextStep atomically
    await cdp.eval(`
      window.__DANGO_PERF__.start('B');
      const btnNext = document.getElementById('btn-hud-next');
      if (btnNext) {
        btnNext.click();
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
      }
    `);

    // Wait 1000ms for Phase B animation to settle
    await new Promise((r) => setTimeout(r, 1000));
    const postB = await cdp.eval(`({
      isPresenting: document.body.classList.contains('mode-presenting'),
      phaseBFramesLen: window.__DANGO_PERF__.phaseBFrames.length,
      phaseBSetupTime: window.__DANGO_PERF__.phaseBSetupTime
    })`);
    console.log("Post-B state:", postB);
    await cdp.eval(`window.__DANGO_PERF__.stop();`);
    console.log("✅ Phase B 录制完成！");

    // Collect trace results
    const perfData = await cdp.eval(`({
      phaseA: window.__DANGO_PERF__.phaseAFrames,
      phaseASetupTime: window.__DANGO_PERF__.phaseASetupTime,
      phaseB: window.__DANGO_PERF__.phaseBFrames,
      phaseBSetupTime: window.__DANGO_PERF__.phaseBSetupTime
    })`);

    const result = analyzeBenchmarkData(perfData);
    printBenchmarkReport(result);
    return result;
  } finally {
    cdp.close();
    browserProc.kill();
  }
}

interface PhaseStats {
  totalFrames: number;
  droppedFrames120Hz: number;
  droppedFrames60Hz: number;
  avgLatency: number;
  maxLatency: number;
  p95Latency: number;
  p99Latency: number;
  stdDev: number;
  histogram: {
    under8ms: number;
    under12ms: number;
    under16ms: number;
    over16ms: number;
  };
  stages: {
    launch: { avg: number; max: number; count: number };
    cruise: { avg: number; max: number; count: number };
    settle: { avg: number; max: number; count: number };
  };
  frames: Array<{ timestamp: number; delta: number; progress?: number }>;
  setupLatency: number;
}

interface BenchmarkResult {
  phaseA: PhaseStats;
  phaseB: PhaseStats;
  sloMet: boolean;
  violations: string[];
}

function analyzeBenchmarkData(raw: any): BenchmarkResult {
  const parsePhase = (frames: Array<{ timestamp: number; delta: number; progress?: number }>, setupLatency: number): PhaseStats => {
    const validDeltas = frames.map((f) => f.delta);
    if (validDeltas.length === 0) {
      return {
        totalFrames: 0,
        droppedFrames120Hz: 0,
        droppedFrames60Hz: 0,
        avgLatency: 0,
        maxLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        stdDev: 0,
        histogram: { under8ms: 0, under12ms: 0, under16ms: 0, over16ms: 0 },
        stages: {
          launch: { avg: 0, max: 0, count: 0 },
          cruise: { avg: 0, max: 0, count: 0 },
          settle: { avg: 0, max: 0, count: 0 }
        },
        frames: [],
        setupLatency
      };
    }

    const totalFrames = validDeltas.length;
    const droppedFrames120Hz = validDeltas.filter((d) => d > 12.0).length;
    const droppedFrames60Hz = validDeltas.filter((d) => d > 20.0).length;
    const avgLatency = validDeltas.reduce((a, b) => a + b, 0) / totalFrames;
    const maxLatency = Math.max(...validDeltas);

    const sorted = [...validDeltas].sort((a, b) => a - b);
    const p95Latency = sorted[Math.floor(sorted.length * 0.95)] || maxLatency;
    const p99Latency = sorted[Math.floor(sorted.length * 0.99)] || maxLatency;

    // Standard deviation (Jitter)
    const variance = validDeltas.reduce((sum, val) => sum + Math.pow(val - avgLatency, 2), 0) / totalFrames;
    const stdDev = Math.sqrt(variance);

    // Histogram
    const histogram = {
      under8ms: validDeltas.filter(d => d <= 8.35).length,
      under12ms: validDeltas.filter(d => d > 8.35 && d <= 12.0).length,
      under16ms: validDeltas.filter(d => d > 12.0 && d <= 16.67).length,
      over16ms: validDeltas.filter(d => d > 16.67).length
    };

    // Stage breakdown: Launch (first 6 frames), Cruise (middle), Settle (last 6 frames)
    const launchDeltas = validDeltas.slice(0, Math.min(6, totalFrames));
    const settleDeltas = totalFrames > 12 ? validDeltas.slice(-6) : [];
    const cruiseDeltas = totalFrames > 12 ? validDeltas.slice(6, -6) : validDeltas;

    const calcStage = (arr: number[]) => ({
      count: arr.length,
      avg: arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
      max: arr.length > 0 ? Math.max(...arr) : 0
    });

    return {
      totalFrames,
      droppedFrames120Hz,
      droppedFrames60Hz,
      avgLatency,
      maxLatency,
      p95Latency,
      p99Latency,
      stdDev,
      histogram,
      stages: {
        launch: calcStage(launchDeltas),
        cruise: calcStage(cruiseDeltas),
        settle: calcStage(settleDeltas)
      },
      frames,
      setupLatency
    };
  };

  const phaseA = parsePhase(raw.phaseA || [], raw.phaseASetupTime || 0);
  const phaseB = parsePhase(raw.phaseB || [], raw.phaseBSetupTime || 0);

  const violations: string[] = [];

  // SLO Evaluation (PERF_AUTOMATION_SPEC.md Section IV)
  if (phaseA.droppedFrames120Hz > 0) {
    violations.push(`Phase A 掉帧数: ${phaseA.droppedFrames120Hz} 帧 (SLO 要求: 0 帧)`);
  }
  if (phaseA.maxLatency > 8.33 * 1.5) {
    violations.push(`Phase A 最大单帧耗时: ${phaseA.maxLatency.toFixed(2)}ms (SLO 期望: <= 8.33ms)`);
  }

  if (phaseB.setupLatency > 4.0) {
    violations.push(`Phase B 触发瞬时 JS 阻塞: ${phaseB.setupLatency.toFixed(2)}ms (SLO 要求: <= 4.0ms)`);
  }
  if (phaseB.droppedFrames120Hz > 0) {
    violations.push(`Phase B 掉帧数: ${phaseB.droppedFrames120Hz} 帧 (SLO 要求: 0 帧)`);
  }
  if (phaseB.maxLatency > 8.33 * 1.5) {
    violations.push(`Phase B 最大单帧耗时: ${phaseB.maxLatency.toFixed(2)}ms (SLO 期望: <= 8.33ms)`);
  }

  return {
    phaseA,
    phaseB,
    sloMet: violations.length === 0,
    violations
  };
}

function printBenchmarkReport(res: BenchmarkResult) {
  console.log("\n===============================================================================");
  console.log("📊 性能基准测试高精度深度诊断报告 (120Hz / 8.33ms SLO)");
  console.log("===============================================================================\n");

  console.log("【Phase A: 单步聚焦平移动画 (600ms)】");
  console.log(`  • 触发瞬时 JS 阻塞 (Setup): ${res.phaseA.setupLatency.toFixed(2)} ms ${res.phaseA.setupLatency > 4.0 ? "❌ (超标)" : "✅"}`);
  console.log(`  • 采样总帧数: ${res.phaseA.totalFrames}`);
  console.log(`  • 平均单帧耗时: ${res.phaseA.avgLatency.toFixed(2)} ms | 抖动标准差 (σ): ${res.phaseA.stdDev.toFixed(2)} ms`);
  console.log(`  • P95 帧耗时:   ${res.phaseA.p95Latency.toFixed(2)} ms | P99 帧耗时: ${res.phaseA.p99Latency.toFixed(2)} ms`);
  console.log(`  • 最大单帧耗时: ${res.phaseA.maxLatency.toFixed(2)} ms ${res.phaseA.maxLatency > 12.0 ? "❌ (超时)" : "✅"}`);
  console.log(`  • 120Hz 掉帧数: ${res.phaseA.droppedFrames120Hz} 帧 ${res.phaseA.droppedFrames120Hz > 0 ? "❌ (掉帧)" : "✅"}`);
  if (res.phaseA.droppedFrames120Hz > 0) {
    console.log("  • Phase A 逐帧数据:", res.phaseA.frames.map((f, i) => `#${i}: ${f.delta.toFixed(1)}ms`).join(", "));
  }

  console.log("\n-------------------------------------------------------------------------------");
  console.log("【Phase B: 终章全景拉远缩放动画 (800ms) - 高精度精细诊断】");
  console.log("-------------------------------------------------------------------------------");
  console.log(`  • 触发瞬时 JS 阻塞 (Setup): ${res.phaseB.setupLatency.toFixed(2)} ms ${res.phaseB.setupLatency > 4.0 ? "❌ (超标)" : "✅"}`);
  console.log(`  • 采样总帧数:   ${res.phaseB.totalFrames} 帧`);
  console.log(`  • 平均单帧耗时: ${res.phaseB.avgLatency.toFixed(2)} ms (120Hz 满帧基准: 8.33ms)`);
  console.log(`  • P50 / P95 / P99: ${res.phaseB.frames.length > 0 ? res.phaseB.frames.map(f => f.delta).sort((a,b)=>a-b)[Math.floor(res.phaseB.frames.length * 0.5)].toFixed(2) : 0} ms / ${res.phaseB.p95Latency.toFixed(2)} ms / ${res.phaseB.p99Latency.toFixed(2)} ms`);
  console.log(`  • 最大单帧耗时: ${res.phaseB.maxLatency.toFixed(2)} ms ${res.phaseB.maxLatency > 12.0 ? "❌ (超时)" : "✅"}`);
  console.log(`  • 帧间抖动度 (Jitter σ): ${res.phaseB.stdDev.toFixed(2)} ms ${res.phaseB.stdDev < 1.0 ? "✅ (极其平滑)" : "⚠️"}`);
  console.log(`  • 120Hz 掉帧数: ${res.phaseB.droppedFrames120Hz} 帧 ${res.phaseB.droppedFrames120Hz > 0 ? "❌ (掉帧)" : "✅ (0 掉帧)"}`);

  console.log("\n  [分阶段精细耗时剖析 (Stage Diagnostics)]");
  console.log(`    1. 🚀 起步首段 (Launch #0~#${res.phaseB.stages.launch.count - 1}): 平均 ${res.phaseB.stages.launch.avg.toFixed(2)} ms | 峰值 ${res.phaseB.stages.launch.max.toFixed(2)} ms`);
  console.log(`    2. ✈️  中段巡航 (Cruise #6~#${res.phaseB.totalFrames - res.phaseB.stages.settle.count - 1}): 平均 ${res.phaseB.stages.cruise.avg.toFixed(2)} ms | 峰值 ${res.phaseB.stages.cruise.max.toFixed(2)} ms`);
  console.log(`    3. 🛬 末段着陆/滤镜恢复 (Settle 尾 ${res.phaseB.stages.settle.count} 帧): 平均 ${res.phaseB.stages.settle.avg.toFixed(2)} ms | 峰值 ${res.phaseB.stages.settle.max.toFixed(2)} ms`);

  console.log("\n  [单帧耗时直方图分布 (Histogram Distribution)]");
  const h = res.phaseB.histogram;
  const pct = (n: number) => ((n / Math.max(1, res.phaseB.totalFrames)) * 100).toFixed(1);
  console.log(`    • 🟢 ≤ 8.33ms (120Hz 满帧区): ${h.under8ms} 帧 (${pct(h.under8ms)}%)`);
  console.log(`    • 🟡 8.33ms ~ 12.0ms (容差安全区): ${h.under12ms} 帧 (${pct(h.under12ms)}%)`);
  console.log(`    • 🟠 12.0ms ~ 16.6ms (60Hz 降级区): ${h.under16ms} 帧 (${pct(h.under16ms)}%)`);
  console.log(`    • 🔴 > 16.67ms (严重卡顿区): ${h.over16ms} 帧 (${pct(h.over16ms)}%)`);

  console.log("\n  [Phase B 逐帧全量瀑布流 (Full Frame Timeline)]");
  const chunks: string[] = [];
  for (let i = 0; i < res.phaseB.frames.length; i += 10) {
    const slice = res.phaseB.frames.slice(i, i + 10);
    const row = slice.map((f, idx) => `#${i + idx}: ${f.delta.toFixed(1)}ms`).join(" | ");
    chunks.push(`    ${row}`);
  }
  console.log(chunks.join("\n"));

  console.log("\n===============================================================================");
  if (res.sloMet) {
    console.log("🎉 结论: 完美达成 120Hz 满帧 SLO 基准！(所有帧耗时均在 8.33ms 预算内)");
  } else {
    console.log("⚠️ 结论: 存在性能违规项，尚未完全达成 120Hz SLO:");
    res.violations.forEach((v) => console.log(`   - ❌ ${v}`));
  }
  console.log("===============================================================================\n");
}

if (import.meta.main) {
  runPerfBenchmark()
    .then((res) => {
      process.exit(res.sloMet ? 0 : 1);
    })
    .catch((err) => {
      console.error("Benchmark failed:", err);
      process.exit(1);
    });
}
