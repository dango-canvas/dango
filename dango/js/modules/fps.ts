// modules/fps.ts
let isFpsActive = false;
let fpsPanel: HTMLElement | null = null;
let animFrameId: number | null = null;

export function FPS(): boolean {
    isFpsActive = !isFpsActive;
    if (isFpsActive) {
        let canvas: HTMLCanvasElement | null = null;
        let ctx: CanvasRenderingContext2D | null = null;
        let fpsNumEl: HTMLElement | null = null;
        let fpsMsEl: HTMLElement | null = null;
        let fpsLowEl: HTMLElement | null = null;

        const width = 194;
        const height = 22;

        if (!fpsPanel && typeof document !== 'undefined') {
            fpsPanel = document.createElement('div');
            fpsPanel.id = 'dango-fps-monitor';
            fpsPanel.style.cssText = [
                'position: fixed',
                'top: 12px',
                'left: 12px',
                'z-index: 999999',
                'background: rgba(0, 0, 0, 0.85)',
                'backdrop-filter: blur(12px)',
                '-webkit-backdrop-filter: blur(12px)',
                'color: #e2e8f0',
                'font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                'font-size: 11px',
                'padding: 7px 11px 8px 11px',
                'border-radius: 8px',
                'pointer-events: auto',
                'cursor: pointer',
                'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
                'border: 1px solid rgba(255, 255, 255, 0.1)',
                'user-select: none',
                'display: flex',
                'flex-direction: column',
                'gap: 5px',
                'width: 216px',
                'box-sizing: border-box'
            ].join(';');
            fpsPanel.title = '';
            fpsPanel.onclick = () => FPS();

            // 顶部文字区
            const header = document.createElement('div');
            header.style.cssText = 'display: flex; align-items: baseline; justify-content: space-between; line-height: 1; padding: 1px 1px 0 1px; font-variant-numeric: tabular-nums;';
            header.innerHTML = `
                <div style="font-size: 14px; font-weight: 600; color: #e2e8f0; letter-spacing: -0.3px; flex-shrink: 0;">FPS <b id="dango-fps-num" style="font-weight: 700; color: #10b981; transition: color 0.25s ease;">--</b></div>
                <div style="font-size: 12px; color: #52525b; letter-spacing: -0.2px; display: flex; align-items: baseline; gap: 8px;">
                    <span id="dango-fps-ms" style="color: #71717a; text-align: right; min-width: 44px; display: inline-block;">--ms</span>
                    <span style="color: #52525b; text-align: right; min-width: 68px; display: inline-block;">1% Low <span id="dango-fps-low" style="color: #71717a; transition: color 0.25s ease;">--</span></span>
                </div>
            `;
            fpsPanel.appendChild(header);

            // 底部 Canvas 容器
            const canvasWrap = document.createElement('div');
            canvasWrap.style.cssText = 'position: relative; width: 100%; height: 22px; background: rgba(0, 0, 0, 0.45); border-radius: 4px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.03);';

            canvas = document.createElement('canvas');
            canvas.style.cssText = 'width: 100%; height: 100%; display: block;';
            canvasWrap.appendChild(canvas);
            fpsPanel.appendChild(canvasWrap);

            document.body.appendChild(fpsPanel);

            fpsNumEl = header.querySelector('#dango-fps-num');
            fpsMsEl = header.querySelector('#dango-fps-ms');
            fpsLowEl = header.querySelector('#dango-fps-low');

            if (canvas && typeof canvas.getContext === 'function') {
                ctx = canvas.getContext('2d');
                const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
                canvas.width = width * dpr;
                canvas.height = height * dpr;
                if (ctx) ctx.scale(dpr, dpr);
            }
        } else if (fpsPanel) {
            fpsPanel.style.display = 'flex';
            canvas = fpsPanel.querySelector('canvas');
            if (canvas && typeof canvas.getContext === 'function') {
                ctx = canvas.getContext('2d');
            }
            fpsNumEl = fpsPanel.querySelector('#dango-fps-num');
            fpsMsEl = fpsPanel.querySelector('#dango-fps-ms');
            fpsLowEl = fpsPanel.querySelector('#dango-fps-low');
        }

        const MAX_SAMPLES = 50;
        let targetFps = 60;
        let targetFrameBudget = 1000 / targetFps;
        const frameTimes: number[] = new Array(MAX_SAMPLES).fill(targetFrameBudget);

        let lastTime = performance.now();
        let frameCount = 0;
        let lastUpdate = lastTime;
        const TEXT_UPDATE_INTERVAL = 500; // 500ms 舒适平稳刷新

        function renderSparkline() {
            if (!ctx) return;
            ctx.clearRect(0, 0, width, height);

            const topY = 3.5;
            const bottomY = height - 3.5;
            const travel = bottomY - topY;
            const stepX = width / (MAX_SAMPLES - 1);

            // 1. 计算每个采样点的坐标与严重度级别
            const points: { x: number; y: number; delta: number; level: number }[] = [];
            for (let i = 0; i < frameTimes.length; i++) {
                const delta = frameTimes[i];
                const x = i * stepX;

                // 非线性重力下坠映射 (tanh 软饱和阻尼)
                const overtime = Math.max(0, delta - targetFrameBudget);
                const sagRatio = Math.min(1.0, Math.tanh(overtime / 20));
                const y = topY + sagRatio * travel;

                let level = 0;
                if (delta > targetFrameBudget * 2.4) {
                    level = 2; // 红 (> 40ms @ 60Hz)
                } else if (delta > targetFrameBudget * 1.2) {
                    level = 1; // 黄 (20ms ~ 40ms @ 60Hz)
                }

                points.push({ x, y, delta, level });
            }

            // 2. 识别下坠尖峰区间，整尖按最深严重度统一染色
            const pointColors = new Array(points.length).fill('#10b981');
            let inSpike = false;
            let spikeStartIndex = 0;
            let maxSpikeLevel = 0;

            for (let i = 0; i < points.length; i++) {
                const isDropped = points[i].level > 0 || (points[i].y > topY + 0.4);
                if (isDropped) {
                    if (!inSpike) {
                        inSpike = true;
                        spikeStartIndex = Math.max(0, i - 1);
                        maxSpikeLevel = points[i].level;
                    } else {
                        if (points[i].level > maxSpikeLevel) {
                            maxSpikeLevel = points[i].level;
                        }
                    }
                } else {
                    if (inSpike) {
                        const spikeEndIndex = i;
                        const spikeColor = maxSpikeLevel === 2 ? '#f43f5e' : maxSpikeLevel === 1 ? '#f59e0b' : '#10b981';
                        for (let k = spikeStartIndex; k <= spikeEndIndex; k++) {
                            pointColors[k] = spikeColor;
                        }
                        inSpike = false;
                        maxSpikeLevel = 0;
                    }
                }
            }
            if (inSpike) {
                const spikeColor = maxSpikeLevel === 2 ? '#f43f5e' : maxSpikeLevel === 1 ? '#f59e0b' : '#10b981';
                for (let k = spikeStartIndex; k < points.length; k++) {
                    pointColors[k] = spikeColor;
                }
            }

            // 3. 绘制极弱的顶部参考基线
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 0.8;
            ctx.moveTo(0, topY);
            ctx.lineTo(width, topY);
            ctx.stroke();

            if (points.length < 2) return;

            // 4. 按三阶贝塞尔平滑流体曲线段逐段绘制（整尖纯色）
            ctx.save();
            ctx.lineWidth = 1.25;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[Math.max(0, i - 1)];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = points[Math.min(points.length - 1, i + 2)];

                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);

                const segmentColor = (pointColors[i] === '#f43f5e' || pointColors[i + 1] === '#f43f5e')
                    ? '#f43f5e'
                    : (pointColors[i] === '#f59e0b' || pointColors[i + 1] === '#f59e0b')
                        ? '#f59e0b'
                        : '#10b981';

                ctx.strokeStyle = segmentColor;
                ctx.stroke();
            }
            ctx.restore();
        }

        function updateLoop(now: number) {
            if (!isFpsActive) return;
            const delta = now - lastTime;
            lastTime = now;
            frameCount++;

            // 目标刷新率自适应识别 (如检测到 120Hz，则升级预算)
            if (delta > 0 && delta < 11.0 && targetFps === 60 && frameCount > 30) {
                targetFps = 120;
                targetFrameBudget = 1000 / 120;
            }

            frameTimes.shift();
            frameTimes.push(delta);

            renderSparkline();

            const elapsedSinceUpdate = now - lastUpdate;
            if (elapsedSinceUpdate >= TEXT_UPDATE_INTERVAL) {
                const fps = Math.min(targetFps, Math.round((frameCount * 1000) / elapsedSinceUpdate));

                // 统计 1% Low
                let worstDelta = 0;
                for (let i = 0; i < frameTimes.length; i++) {
                    if (frameTimes[i] > worstDelta) worstDelta = frameTimes[i];
                }
                const onePercentLow = Math.min(targetFps, Math.round(1000 / Math.max(targetFrameBudget, worstDelta)));

                if (fpsNumEl) {
                    fpsNumEl.innerText = `${fps}`;
                    fpsNumEl.style.color = fps >= targetFps * 0.90 ? '#10b981' : fps >= targetFps * 0.72 ? '#f59e0b' : '#f43f5e';
                }
                if (fpsMsEl) {
                    fpsMsEl.innerText = `${delta.toFixed(1)}ms`;
                }
                if (fpsLowEl) {
                    fpsLowEl.innerText = `${onePercentLow}`;
                    fpsLowEl.style.color = onePercentLow >= targetFps * 0.85 ? '#71717a' : onePercentLow >= targetFps * 0.65 ? '#f59e0b' : '#f43f5e';
                }

                frameCount = 0;
                lastUpdate = now;
            }
            animFrameId = requestAnimationFrame(updateLoop);
        }

        animFrameId = requestAnimationFrame(updateLoop);
        console.log('%c[Dango]%c FPS 监测器已开启 (点击面板或输入 FPS() 可关闭)', 'color:#6366f1;font-weight:bold;', 'color:inherit;');
    } else {
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
        if (fpsPanel && fpsPanel.parentNode) {
            fpsPanel.parentNode.removeChild(fpsPanel);
            fpsPanel = null;
        }
        console.log('%c[Dango]%c FPS 监测器已关闭', 'color:#6366f1;font-weight:bold;', 'color:inherit;');
    }
    return isFpsActive;
}

export const toggleFPS = FPS;

// 挂载到全局环境供控制台快速调用
if (typeof window !== 'undefined') {
    (window as any).FPS = FPS;
    (window as any).toggleFPS = FPS;
}
