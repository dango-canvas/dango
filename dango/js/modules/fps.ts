// modules/fps.ts
let isFpsActive = false;
let fpsPanel: HTMLElement | null = null;
let animFrameId: number | null = null;

export function FPS(): boolean {
    isFpsActive = !isFpsActive;
    if (isFpsActive) {
        if (!fpsPanel && typeof document !== 'undefined') {
            fpsPanel = document.createElement('div');
            fpsPanel.id = 'dango-fps-monitor';
            fpsPanel.style.cssText = [
                'position: fixed',
                'top: 12px',
                'left: 12px',
                'z-index: 999999',
                'background: rgba(0, 0, 0, 0.85)',
                'color: #4ade80',
                'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                'font-size: 13px',
                'padding: 6px 12px',
                'border-radius: 8px',
                'pointer-events: auto',
                'cursor: pointer',
                'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)',
                'border: 1px solid rgba(255, 255, 255, 0.1)',
                'user-select: none'
            ].join(';');
            fpsPanel.title = '点击关闭 FPS 监测器 (或在控制台输入 FPS())';
            fpsPanel.onclick = () => FPS();
            document.body.appendChild(fpsPanel);
        } else if (fpsPanel) {
            fpsPanel.style.display = 'block';
        }

        let lastTime = performance.now();
        let frameCount = 0;
        let slowFrames = 0;
        let lastUpdate = lastTime;
        const UPDATE_INTERVAL_MS = 100; // 100ms 高频精细采样（原 400ms），秒级捕捉运镜瞬时掉帧

        function updateLoop(now: number) {
            if (!isFpsActive) return;
            const delta = now - lastTime;
            lastTime = now;
            frameCount++;
            if (delta > 12.0) slowFrames++; // 对于 120Hz (8.33ms 预算)，超过 12ms 计入掉帧统计

            const elapsedSinceUpdate = now - lastUpdate;
            if (elapsedSinceUpdate >= UPDATE_INTERVAL_MS) {
                const fps = Math.round((frameCount * 1000) / elapsedSinceUpdate);
                if (fpsPanel) {
                    fpsPanel.innerHTML = `FPS: <b>${fps}</b> | 瞬时: ${delta.toFixed(1)}ms | 掉帧: ${slowFrames}`;
                    fpsPanel.style.color = fps < 90 ? '#ef4444' : fps < 115 ? '#f59e0b' : '#4ade80';
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
