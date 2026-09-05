// modules/i18n.ts

export type LangCode = 'zh' | 'en';

const TRANSLATIONS: Record<LangCode, Record<string, string>> = {
    zh: {
        page_title: "团子画板：组织灵感，一目了然",
        brand_name: "团子画板",
        lang_toggle: "EN",
        lang_tooltip: "切换至英文",
        input_placeholder: "输入想法... (逗号/换行分隔)",
        btn_add: "✨ 生成节点 ✨",
        btn_export: "导出",
        btn_import: "导入",
        confirm_clear: "确定?",
        help_undo: "撤销 / 重做",
        help_pan: "平移画布",
        help_zoom: "缩放",
        help_edit: "编辑 / 多选",
        help_copy: "复制 / 粘贴",
        help_group: "编组 / 解组",
        help_link: "连线 / 断线",
        help_align: "方向对齐",
        help_color: "切换颜色",
        alert_file_err: "文件格式错误，请上传 .dango 文件",
        settings_tooltip: "设置",
        settings_hide_grid: "隐藏网格点",
        settings_bg_url: "背景图片 URL",
        settings_bg_url_placeholder: "https://... ↵",
        bg_url: "",
        help_tooltip: "帮助/快捷键",
        safety_tooltip: "为什么团子画板是安全的？",
        settings_alt_as_ctrl: "Alt 兼任 Ctrl",
        settings_hand_drawn: "手写风格",
        empty_prompt: "输入想法，开启你的画布 ✨",
        toast_cleared: "画布已清空",
        toast_imported: "画布已导入",
        toast_undo: "撤销",
        toast_export_prev: "导出刚刚的备份 ✨",
        toast_import_success: "导入成功 ✨",
        toast_export_image_success: "截图已导出 ✨",
        toast_canvas_empty: "画布为空，无法导出",
        toast_easter_dango: "🍡 团子连击",
        help_delete: "删除选中",
        help_home: "回归中心",
        help_pan_zoom: "平移 / 缩放",
        help_center: "回归视图中心",
        help_save: "保存画板文件",
        help_center_align: "分布对齐",
        help_clone: "克隆选中节点",
        help_select: "多选 / 框选",
        help_nudge: "微调位置",
        btn_export_link: "链接",
        btn_export_file: "文件",
        btn_export_embed: "嵌入",
        help_link_style: "切换线形",
        help_directional_create: "方向创建 / 重复",
        about_title: "关于",
        feedback: "反馈",
        about_desc: "简单、优雅的概念关系可视化工具。\n\n组织灵感，一目了然。",
        star_on_github: "在 GitHub 上点星支持",
        star_thanks: "感谢你的点星！✨",
        blog_link: "开发博客",
        privacy_policy: "隐私声明",
        terms_of_service: "用户条款",
        buy_coffee: "请喝咖啡",
        toast_copy_link_success: "链接已复制 ✨",
        help_spotlight: "聚光灯",
        embed_info_text: "嵌入模式，修改不保存。",
        embed_info_tooltip: "了解嵌入模式",
        embed_open_tooltip: "在团子画板中打开并编辑",
        toast_copy_embed_success: "嵌入代码已复制 ✨",
        modal_copy_title: "请手动复制链接并在浏览器中打开 ✨",
        modal_copy_desc: "由于 Obsidian 的安全策略限制，请右键复制以下链接：",
        modal_copy_btn: "我已复制",
        toast_manual_copy_done: "去浏览器粘贴并打开吧 ✨",
        help_smart_align: "智能自动对齐",
        help_hint_jump: "快速跳转 / 加选",
        img_zoom_in: "图像放大",
        img_zoom_out: "图像缩小",
        theme_tooltip: "切换主题",
        search_placeholder: "搜索节点...",
        help_search: "搜索节点",
        search_prev: "上一个 (Shift+Enter)",
        search_next: "下一个 (Enter)",
        search_close: "关闭 (Esc)",
        toast_tagging_enter: "标记演示模式",
        toast_tagging_exit: "已退出标记演示模式 ✨",
        btn_tagging_exit: "退出 (T)",
        btn_tagging_present: "开始演示 (P)",
        toast_presentation_finished: "演示已完成 ✨",
        btn_presentation_exit: "退出演示",
        toast_no_steps_to_present: "尚未标记任何时间步骤",
        tagging_guide_tip1: "· 点击：添加 / 取消序号",
        tagging_guide_tip2: "· 删除：清除序号",
        help_tagging: "标记演示模式",
        help_present_step: "下一步 / 上一步",
        help_present_all: "全景展开 / 退出",
        settings_hide_toolbar: "隐藏悬浮栏",
        settings_show_toolbar: "隐藏悬浮栏",
        dock_undo: "撤销 (Ctrl+Z)",
        dock_redo: "重做 (Ctrl+Y)",
        dock_search: "搜索节点 (Ctrl+F)",
        dock_center: "回归中心 (Home)",
        dock_present: "标记演示 (T)",
        dock_color: "改色 (Alt+1~9)",
        dock_extrude: "拖拽衍生 (Ctrl+方向键)",
        dock_clone: "克隆副本 (Ctrl+Drag)",
        dock_delete: "删除节点 (Del)",
        dock_link: "拓扑连线 (Ctrl+L)",
        dock_link_style: "切换线形 (Ctrl+')",
        dock_align: "对齐 (Alt+WASD)",
        dock_smart_align: "智能排版 (Alt+.)",
        align_left: "左对齐 (Alt+A)",
        align_center_x: "水平居中 (Alt+H)",
        align_right: "右对齐 (Alt+D)",
        align_top: "顶对齐 (Alt+W)",
        align_center_y: "垂直居中 (Alt+J)",
        align_bottom: "底对齐 (Alt+S)",
        dock_group: "编组 / 解组 (Ctrl+G)",
        dock_delete_multi: "批量删除 (Del)",
        toast_dock_show: "已显示悬浮栏 ✨",
        toast_dock_hide: "已隐藏悬浮栏 ✨",
        toast_feedback_invite: "帮助我们连接下一个绝佳的功能点？🍡",
        toast_feedback_btn: "连接想法",
        safety_url: "https://blog.dango.ink/why-dango-is-secure",
        safety_tooltip: "为什么 Dango 是安全的？",
        extrude_ghost_text: "✨ 释放落子新想法"
    },
    en: {
        page_title: "Dango: Drop a nugget, get organized",
        brand_name: "Dango",
        lang_toggle: "中",
        lang_tooltip: "Switch to Chinese",
        input_placeholder: "Enter ideas... (Comma/NewLine)",
        btn_add: "✨ Create Nodes ✨",
        btn_export: "Export",
        btn_import: "Import",
        confirm_clear: "Sure?",
        help_undo: "Undo / Redo",
        help_pan: "Pan Canvas",
        help_color: "Change Color",
        help_copy: "Copy / Paste",
        help_group: "Group / Ungroup",
        help_link: "Link / Unlink",
        help_align: "Directional Align",
        alert_file_err: "Invalid format, please upload .dango file",
        settings_tooltip: "Settings",
        settings_hide_grid: "Hide Grid Dots",
        settings_bg_url: "Background URL",
        settings_bg_url_placeholder: "https://... ↵",
        bg_url: "",
        help_tooltip: "Help / Shortcut",
        safety_tooltip: "Why is Dango secure?",
        settings_alt_as_ctrl: "Alt as Ctrl modifier",
        settings_hand_drawn: "Hand-drawn Style",
        empty_prompt: "Type ideas here to start ✨",
        toast_cleared: "Canvas cleared",
        toast_imported: "Canvas imported",
        toast_undo: "Undo",
        toast_export_prev: "Export Backup ✨",
        toast_import_success: "Imported successfully ✨",
        toast_export_image_success: "Screenshot exported ✨",
        toast_canvas_empty: "Canvas is empty",
        toast_easter_dango: "🍡 Dango combo",
        help_delete: "Delete Selected",
        help_home: "Back to Center",
        help_pan_zoom: "Pan / Zoom",
        help_center: "Reset View",
        help_save: "Save Dango File",
        help_center_align: "Align Distribution",
        help_clone: "Clone Node",
        help_select: "Multi-select",
        help_nudge: "Nudge Position",
        btn_export_link: "LINK",
        btn_export_file: "FILE",
        btn_export_embed: "EMBED",
        help_link_style: "Cycle Line Style",
        help_directional_create: "Directional Create",
        about_title: "About",
        feedback: "Feedback",
        about_desc: "Drop a nugget, get organized.",
        star_on_github: "Star on GitHub",
        star_thanks: "Thanks for your Star! ✨",
        blog_link: "Dev Blog",
        privacy_policy: "Privacy Policy",
        terms_of_service: "Terms of Service",
        buy_coffee: "Buy me a coffee",
        toast_copy_link_success: "Link copied ✨",
        help_spotlight: "Spotlight",
        embed_info_text: "Preview Mode: Changes are temporary. To save permanently, open in full version to export.",
        embed_info_tooltip: "About Preview Mode",
        embed_open_tooltip: "Open in Dango to Edit",
        toast_copy_embed_success: "Embed code copied ✨",
        modal_copy_title: "Copy Link and Open in Browser ✨",
        modal_copy_desc: "Due to Obsidian's security policy, please right-click copy the link below:",
        modal_copy_btn: "Done, Copied",
        toast_manual_copy_done: "Go paste and open in your browser ✨",
        help_smart_align: "Smart Auto-align",
        help_hint_jump: "Quick Jump / Multi",
        img_zoom_in: "Zoom In Image",
        img_zoom_out: "Zoom Out Image",
        theme_tooltip: "Toggle Theme",
        search_placeholder: "Search nodes...",
        help_search: "Search Nodes",
        search_prev: "Previous (Shift+Enter)",
        search_next: "Next (Enter)",
        search_close: "Close (Esc)",
        toast_tagging_enter: "Tag & Present Mode",
        toast_tagging_exit: "Exited Tag & Present Mode ✨",
        btn_tagging_exit: "Exit (T)",
        btn_tagging_present: "Present (P)",
        toast_presentation_finished: "Presentation completed ✨",
        btn_presentation_exit: "Exit",
        toast_no_steps_to_present: "No timeline steps tagged yet",
        tagging_guide_tip1: "· Click: Tag / untag step",
        tagging_guide_tip2: "· Delete: Clear step",
        help_tagging: "Tag & Present Mode",
        help_present_step: "Next / Prev Step",
        help_present_all: "Reveal All / Exit",
        settings_hide_toolbar: "Hide Floating Toolbar",
        settings_show_toolbar: "Hide Floating Toolbar",
        dock_undo: "Undo (Ctrl+Z)",
        dock_redo: "Redo (Ctrl+Y)",
        dock_search: "Search Nodes (Ctrl+F)",
        dock_center: "Reset View (Home)",
        dock_present: "Tag & Present (T)",
        dock_color: "Color (Alt+1~9)",
        dock_extrude: "Drag to Extrude Branch (Ctrl+Arrow)",
        dock_clone: "Clone Node (Ctrl+Drag)",
        dock_delete: "Delete Node (Del)",
        dock_link: "Link / Unlink (Ctrl+L)",
        dock_link_style: "Cycle Line Style (Ctrl+')",
        dock_align: "Align (Alt+WASD)",
        dock_smart_align: "Smart Auto-align (Alt+.)",
        align_left: "Align Left (Alt+A)",
        align_center_x: "Align Center X (Alt+H)",
        align_right: "Align Right (Alt+D)",
        align_top: "Align Top (Alt+W)",
        align_center_y: "Align Center Y (Alt+J)",
        align_bottom: "Align Bottom (Alt+S)",
        dock_group: "Group / Ungroup (Ctrl+G)",
        dock_delete_multi: "Delete Selected (Del)",
        toast_dock_show: "Floating toolbar enabled ✨",
        toast_dock_hide: "Floating toolbar hidden ✨",
        toast_feedback_invite: "Help us link the next great node? 🍡",
        toast_feedback_btn: "Link Ideas",
        safety_url: "https://blog.dango.ink/why-dango-is-secure-en",
        safety_tooltip: "Why is Dango secure?",
        extrude_ghost_text: "✨ Release to drop new idea"
    }
};

const LS_LANG_KEY = 'cc-lang';
let currentLang: LangCode = 'zh';

/**
 * 初始化语言设置，从本地存储或浏览器设置中获取
 */
export function initI18n(): void {
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(LS_LANG_KEY) as LangCode | null;
        if (saved === 'zh' || saved === 'en') {
            currentLang = saved;
            return;
        }
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
        currentLang = navigator.language.startsWith('zh') ? 'zh' : 'en';
    } else {
        currentLang = 'zh';
    }
}

/**
 * 切换语言
 */
export function toggleLang(): LangCode {
    currentLang = currentLang === 'zh' ? 'en' : 'zh';
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LS_LANG_KEY, currentLang);
    }
    return currentLang;
}

/**
 * 获取当前语言代码
 */
export function getCurrentLang(): LangCode {
    return currentLang;
}

/**
 * 获取当前语言的文本集
 */
export function getTexts(): Record<string, string> {
    return TRANSLATIONS[currentLang];
}

/**
 * 根据当前语言更新页面所有UI文本
 */
export function updateI18n(): void {
    if (typeof document === 'undefined') return;
    const texts = getTexts();
    document.title = texts.page_title;
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key && texts[key]) el.innerText = texts[key];
    });
    document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key && texts[key]) el.title = texts[key];
    });
    document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key && texts[key]) el.placeholder = texts[key];
    });
    const btnLang = document.getElementById('btn-lang');
    if (btnLang) btnLang.innerText = texts['lang_toggle'];

    const btnClear = document.getElementById('btn-clear');
    if (btnClear && !btnClear.classList.contains('btn-danger')) {
        btnClear.innerText = "🗑️";
    }
    const mainBtn = document.querySelector<HTMLElement>('#export-container [data-i18n="btn_export"]');
    if (mainBtn) mainBtn.innerText = texts.btn_export;

    const feedbackToast = document.querySelector<HTMLElement>('.toast[data-toast-id="feedback-invite"]');
    if (feedbackToast) {
        const titleWrap = feedbackToast.querySelector<HTMLElement>('.toast-title-wrap');
        if (titleWrap && texts.toast_feedback_invite) {
            titleWrap.innerText = texts.toast_feedback_invite;
        }
        const actionBtn = feedbackToast.querySelector<HTMLElement>('.btn-toast-primary');
        if (actionBtn && texts.toast_feedback_btn) {
            actionBtn.innerText = texts.toast_feedback_btn;
        }
    }

    const btnSafety = document.getElementById('btn-safety') as HTMLAnchorElement | null;
    if (btnSafety) {
        if (texts.safety_url) btnSafety.href = texts.safety_url;
        if (texts.safety_tooltip) btnSafety.title = texts.safety_tooltip;
    }
}
