// ==UserScript==
// @name         知乎内容导出（NotebookLM + Obsidian）
// @namespace    https://github.com/heritager/zhihu-exporter
// @version      4.0.0
// @description  导出答主内容或问题回答，支持兼容单 Markdown 与 NotebookLM + Obsidian Zip 双模式
// @author       ZhihuExporter
// @license      MIT
// @match        https://www.zhihu.com/people/*
// @match        https://www.zhihu.com/question/*
// @icon         https://static.zhihu.com/heifetz/favicon.ico
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    const EXPORT_MODE_LEGACY = 'legacy_single_md';
    const EXPORT_MODE_DUAL_ZIP = 'dual_zip';
    const NOTEBOOKLM_MAX_SOURCES = 50;
    const NOTEBOOKLM_RESERVED_SOURCES = 2;
    const NOTEBOOKLM_MAX_CONTENT_SOURCES = NOTEBOOKLM_MAX_SOURCES - NOTEBOOKLM_RESERVED_SOURCES;
    const TYPE_LABELS = { answer: '回答', article: '文章', pin: '想法', question: '问题' };
    const IMAGE_EXTENSION_BY_TYPE = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/avif': 'avif',
        'image/svg+xml': 'svg'
    };

    const CONFIG = {
        linkStyle: 'obsidian',     // 'obsidian' | 'standard'
        addFrontmatter: true,
        useCallout: true,
        requestDelay: 350,
        exportMode: EXPORT_MODE_LEGACY,
        downloadImages: true,
        maxRequestRetries: 3,
        retryBaseDelay: 1200,
        requestTimeoutMs: 20000,
        largeLegacySoftLimit: 600
    };

    // ======================== 主对象 ========================
    const ZhihuExporter = {

        // ---- 状态 ----
        mode: null,          // 'person' | 'question'
        urlToken: null,      // 答主 url_token
        questionId: null,    // 问题 id
        ui: {},
        aborted: false,
        saveTarget: 'download',
        directoryHandle: null,
        stats: { answers: 0, articles: 0, pins: 0 },
        runWarnings: [],

        // ==================== 初始化 ====================
        init: function() {
            const personMatch = location.pathname.match(/\/people\/([^\/]+)/);
            const questionMatch = location.pathname.match(/\/question\/(\d+)/);

            if (personMatch) {
                this.mode = 'person';
                this.urlToken = this.decodePathToken(personMatch[1]);
            } else if (questionMatch) {
                this.mode = 'question';
                this.questionId = questionMatch[1];
            } else {
                return;
            }

            this.createUI();
        },

        // ==================== UI 创建 ====================
        createUI: function() {
            const panel = document.createElement('div');
            panel.id = 'zhihu-exporter-panel';
            Object.assign(panel.style, {
                position: 'fixed',
                top: '70px',
                right: '20px',
                zIndex: '10000',
                width: '360px',
                maxHeight: 'calc(100vh - 90px)',
                backgroundColor: '#fff',
                borderRadius: '14px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.16)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                overflow: 'auto',
                border: '1px solid #e8e8e8'
            });

            const createSection = (title, hint) => {
                const wrapper = document.createElement('div');
                Object.assign(wrapper.style, {
                    padding: '12px 20px',
                    borderBottom: '1px solid #f0f0f0'
                });

                const head = document.createElement('div');
                head.textContent = title;
                Object.assign(head.style, {
                    fontSize: '13px',
                    color: '#666',
                    marginBottom: hint ? '4px' : '10px'
                });
                wrapper.appendChild(head);

                if (hint) {
                    const hintNode = document.createElement('div');
                    hintNode.textContent = hint;
                    Object.assign(hintNode.style, {
                        fontSize: '11px',
                        color: '#999',
                        marginBottom: '10px',
                        lineHeight: '1.5'
                    });
                    wrapper.appendChild(hintNode);
                }

                return wrapper;
            };

            const optionAccent = this.mode === 'question' ? '#7B2FF7' : '#0066FF';

            const createCheckbox = (id, label, checked) => {
                const wrapper = document.createElement('label');
                Object.assign(wrapper.style, {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '6px 0',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#333'
                });
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.id = id;
                cb.checked = checked;
                Object.assign(cb.style, {
                    width: '16px',
                    height: '16px',
                    accentColor: optionAccent
                });
                const span = document.createElement('span');
                span.textContent = label;
                wrapper.appendChild(cb);
                wrapper.appendChild(span);
                return { wrapper, input: cb };
            };

            const createStackedRadio = (name, value, titleText, checked, hint, recommended) => {
                const wrapper = document.createElement('label');
                Object.assign(wrapper.style, {
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '7px 0',
                    cursor: 'pointer'
                });
                const rb = document.createElement('input');
                rb.type = 'radio';
                rb.name = name;
                rb.value = value;
                rb.checked = checked;
                Object.assign(rb.style, {
                    marginTop: '2px',
                    accentColor: optionAccent
                });
                const textWrap = document.createElement('div');
                const title = document.createElement('div');
                title.textContent = recommended ? titleText + '（推荐）' : titleText;
                Object.assign(title.style, {
                    fontSize: '14px',
                    color: '#333',
                    fontWeight: checked ? '600' : '500'
                });
                const hintNode = document.createElement('div');
                hintNode.textContent = hint;
                Object.assign(hintNode.style, {
                    fontSize: '11px',
                    color: '#999',
                    marginTop: '2px',
                    lineHeight: '1.45'
                });
                textWrap.appendChild(title);
                textWrap.appendChild(hintNode);
                wrapper.appendChild(rb);
                wrapper.appendChild(textWrap);
                return { wrapper, input: rb };
            };

            const createInlineRadio = (name, value, label, checked) => {
                const wrapper = document.createElement('label');
                Object.assign(wrapper.style, {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginRight: '16px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#333'
                });
                const rb = document.createElement('input');
                rb.type = 'radio';
                rb.name = name;
                rb.value = value;
                rb.checked = checked;
                Object.assign(rb.style, { accentColor: optionAccent });
                const span = document.createElement('span');
                span.textContent = label;
                wrapper.appendChild(rb);
                wrapper.appendChild(span);
                return wrapper;
            };

            const header = document.createElement('div');
            const gradientColor = this.mode === 'question'
                ? 'linear-gradient(135deg, #7B2FF7 0%, #9B59B6 100%)'
                : 'linear-gradient(135deg, #0066FF 0%, #1a8cff 100%)';
            Object.assign(header.style, {
                background: gradientColor,
                padding: '16px 20px',
                color: 'white',
                position: 'relative'
            });

            if (this.mode === 'person') {
                header.innerHTML =
                    '<div style="font-size:16px;font-weight:600;">知乎内容导出</div>' +
                    '<div style="font-size:12px;opacity:0.88;margin-top:4px;">答主内容归档，支持 NotebookLM 与 Obsidian 双模式</div>';
            } else {
                header.innerHTML =
                    '<div style="font-size:16px;font-weight:600;">问题回答导出</div>' +
                    '<div style="font-size:12px;opacity:0.88;margin-top:4px;">问题回答学习包，支持结构化 Zip 输出</div>';
            }

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            Object.assign(closeBtn.style, {
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'rgba(255,255,255,0.28)',
                border: 'none',
                color: 'white',
                fontSize: '18px',
                cursor: 'pointer',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                lineHeight: '22px',
                textAlign: 'center',
                padding: '0'
            });
            header.appendChild(closeBtn);
            panel.appendChild(header);

            const contentSection = createSection(
                this.mode === 'person' ? '导出内容' : '问题选项',
                this.mode === 'person' ? '' : '问题导出会把所有回答打包；可选排序与是否包含问题描述。'
            );

            if (this.mode === 'person') {
                contentSection.appendChild(createCheckbox('exp-answers', '导出回答', true).wrapper);
                contentSection.appendChild(createCheckbox('exp-articles', '导出文章', true).wrapper);
                contentSection.appendChild(createCheckbox('exp-pins', '导出想法', true).wrapper);
            } else {
                contentSection.appendChild(createStackedRadio('q-sort', 'default', '默认排序（按热度）', true, '适合学习高信号回答', false).wrapper);
                contentSection.appendChild(createStackedRadio('q-sort', 'created', '按时间排序', false, '适合研究观点演化', false).wrapper);
                const detailCheckbox = createCheckbox('exp-q-detail', '包含问题描述', true);
                Object.assign(detailCheckbox.wrapper.style, {
                    marginTop: '8px',
                    borderTop: '1px solid #f0f0f0',
                    paddingTop: '12px'
                });
                contentSection.appendChild(detailCheckbox.wrapper);
            }
            panel.appendChild(contentSection);

            const linkDiv = createSection('链接风格', '仅 legacy 单 Markdown 模式使用；Zip 模式会自动生成更适合各自工具的链接结构。');
            linkDiv.appendChild(createInlineRadio('link-style', 'obsidian', 'Obsidian 风格', true));
            linkDiv.appendChild(createInlineRadio('link-style', 'standard', '通用 Markdown', false));
            panel.appendChild(linkDiv);

            const exportSection = createSection('导出模式', '新模式会生成一个 Zip，里面同时包含 Obsidian 细粒度笔记与 NotebookLM 学习包。');
            const legacyMode = createStackedRadio('export-mode', EXPORT_MODE_LEGACY, 'Legacy 单 Markdown', true, '兼容旧习惯，生成一个大 Markdown 文件。', false);
            const zipMode = createStackedRadio('export-mode', EXPORT_MODE_DUAL_ZIP, 'NotebookLM + Obsidian Zip', false, '生成索引、多文件笔记、学习 prompts 与资源目录。', true);
            exportSection.appendChild(legacyMode.wrapper);
            exportSection.appendChild(zipMode.wrapper);
            panel.appendChild(exportSection);

            const assetSection = createSection('资源策略', '仅 Zip 模式生效；图片会去重并写入 assets/images。');
            const imageAssetOption = createCheckbox('download-images', '下载图片到本地 assets/ 目录', true);
            assetSection.appendChild(imageAssetOption.wrapper);
            panel.appendChild(assetSection);

            const saveSection = createSection('保存位置', '仅 Zip 模式支持；可直接把导出的 Zip 写入你选择的本地文件夹。');
            const saveDownloadMode = createStackedRadio('save-target', 'download', '正常下载', true, '保持当前行为，交给浏览器下载文件。', false);
            const saveDirectoryMode = createStackedRadio('save-target', 'directory', '保存到指定文件夹（Obsidian）', false, 'Chrome / Edge 可用，当前页面刷新后需要重新选择目录。', true);
            saveSection.appendChild(saveDownloadMode.wrapper);
            saveSection.appendChild(saveDirectoryMode.wrapper);

            const chooseFolderBtn = document.createElement('button');
            chooseFolderBtn.type = 'button';
            chooseFolderBtn.textContent = '选择文件夹';
            Object.assign(chooseFolderBtn.style, {
                width: '100%',
                padding: '9px 10px',
                marginTop: '10px',
                backgroundColor: '#f6f8fb',
                color: '#333',
                border: '1px solid #d9e0ea',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
            });
            saveSection.appendChild(chooseFolderBtn);

            const currentFolderText = document.createElement('div');
            currentFolderText.textContent = '当前文件夹：未选择';
            Object.assign(currentFolderText.style, {
                fontSize: '11px',
                color: '#999',
                marginTop: '8px',
                lineHeight: '1.5',
                wordBreak: 'break-all'
            });
            saveSection.appendChild(currentFolderText);
            panel.appendChild(saveSection);

            const toastWrap = document.createElement('div');
            Object.assign(toastWrap.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                zIndex: '10002',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                pointerEvents: 'none'
            });
            document.body.appendChild(toastWrap);

            const progressDiv = document.createElement('div');
            Object.assign(progressDiv.style, { padding: '12px 20px', display: 'none' });
            const progressBarBg = document.createElement('div');
            Object.assign(progressBarBg.style, {
                width: '100%',
                height: '8px',
                backgroundColor: '#f0f0f0',
                borderRadius: '4px',
                overflow: 'hidden'
            });
            const progressBar = document.createElement('div');
            Object.assign(progressBar.style, {
                width: '0%',
                height: '100%',
                background: this.mode === 'question'
                    ? 'linear-gradient(90deg, #7B2FF7, #9B59B6)'
                    : 'linear-gradient(90deg, #0066FF, #1a8cff)',
                borderRadius: '4px',
                transition: 'width 0.3s ease'
            });
            progressBarBg.appendChild(progressBar);
            progressDiv.appendChild(progressBarBg);

            const progressText = document.createElement('div');
            Object.assign(progressText.style, {
                fontSize: '12px',
                color: '#666',
                marginTop: '8px',
                textAlign: 'center'
            });
            progressText.textContent = '准备中...';
            progressDiv.appendChild(progressText);

            const stageText = document.createElement('div');
            Object.assign(stageText.style, {
                fontSize: '11px',
                color: '#999',
                marginTop: '4px',
                textAlign: 'center'
            });
            progressDiv.appendChild(stageText);
            panel.appendChild(progressDiv);

            const btnDiv = document.createElement('div');
            Object.assign(btnDiv.style, { padding: '12px 20px 16px' });
            const btnColor = this.mode === 'question' ? '#7B2FF7' : '#0066FF';
            const btnHover = this.mode === 'question' ? '#6622cc' : '#0052cc';

            const exportBtn = document.createElement('button');
            exportBtn.textContent = '开始导出';
            Object.assign(exportBtn.style, {
                width: '100%',
                padding: '10px',
                backgroundColor: btnColor,
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
            });
            exportBtn.onmouseenter = () => { if (!exportBtn.disabled) exportBtn.style.backgroundColor = btnHover; };
            exportBtn.onmouseleave = () => { if (!exportBtn.disabled) exportBtn.style.backgroundColor = btnColor; };
            exportBtn.onclick = () => {
                if (this.mode === 'person') this.startPersonExport();
                else this.startQuestionExport();
            };
            btnDiv.appendChild(exportBtn);

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            Object.assign(cancelBtn.style, {
                width: '100%',
                padding: '8px',
                backgroundColor: 'transparent',
                color: '#999',
                border: '1px solid #e8e8e8',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
                marginTop: '8px',
                display: 'none'
            });
            cancelBtn.onclick = () => { this.aborted = true; };
            btnDiv.appendChild(cancelBtn);
            panel.appendChild(btnDiv);

            const toggleBtn = document.createElement('button');
            toggleBtn.textContent = this.mode === 'question' ? '问' : '知';
            Object.assign(toggleBtn.style, {
                position: 'fixed',
                top: '70px',
                right: '20px',
                zIndex: '10001',
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: btnColor,
                color: 'white',
                border: 'none',
                fontSize: '16px',
                cursor: 'pointer',
                display: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            });
            toggleBtn.onclick = () => {
                panel.style.display = 'block';
                toggleBtn.style.display = 'none';
            };
            document.body.appendChild(toggleBtn);

            closeBtn.onclick = () => {
                panel.style.display = 'none';
                toggleBtn.style.display = 'block';
            };

            chooseFolderBtn.onclick = async () => {
                await this.chooseDirectory();
            };

            const refreshModeOptions = () => {
                const isZip = this.getExportMode() === EXPORT_MODE_DUAL_ZIP;
                imageAssetOption.input.disabled = !isZip;
                imageAssetOption.wrapper.style.opacity = isZip ? '1' : '0.55';
                linkDiv.style.opacity = isZip ? '0.72' : '1';
                saveSection.style.display = isZip ? 'block' : 'none';

                const directorySupported = this.isDirectoryWriteSupported();
                const directoryModeEnabled = isZip && directorySupported;
                saveDirectoryMode.input.disabled = !directoryModeEnabled;
                saveDirectoryMode.wrapper.style.opacity = directoryModeEnabled ? '1' : '0.55';
                chooseFolderBtn.disabled = !(directoryModeEnabled && this.getSaveTarget() === 'directory');
                chooseFolderBtn.style.opacity = chooseFolderBtn.disabled ? '0.55' : '1';
                chooseFolderBtn.style.cursor = chooseFolderBtn.disabled ? 'not-allowed' : 'pointer';

                if (!directorySupported) {
                    if (saveDirectoryMode.input.checked) {
                        saveDownloadMode.input.checked = true;
                        this.saveTarget = 'download';
                    }
                    currentFolderText.textContent = '当前文件夹：浏览器不支持目录写入，已回退普通下载';
                } else if (this.directoryHandle && this.directoryHandle.name) {
                    currentFolderText.textContent = '当前文件夹：' + this.directoryHandle.name;
                } else {
                    currentFolderText.textContent = '当前文件夹：未选择';
                }
            };

            legacyMode.input.addEventListener('change', refreshModeOptions);
            zipMode.input.addEventListener('change', refreshModeOptions);
            saveDownloadMode.input.addEventListener('change', () => {
                this.saveTarget = 'download';
                refreshModeOptions();
            });
            saveDirectoryMode.input.addEventListener('change', () => {
                this.saveTarget = 'directory';
                refreshModeOptions();
            });

            document.body.appendChild(panel);
            this.ui = {
                panel,
                progressDiv,
                progressBar,
                progressText,
                stageText,
                exportBtn,
                cancelBtn,
                toggleBtn,
                assetCheckbox: imageAssetOption.input,
                saveSection,
                saveDownloadMode: saveDownloadMode.input,
                saveDirectoryMode: saveDirectoryMode.input,
                chooseFolderBtn,
                currentFolderText,
                toastWrap,
                refreshModeOptions
            };
            refreshModeOptions();
        },

        getExportMode: function() {
            const selected = document.querySelector('input[name="export-mode"]:checked');
            return selected ? selected.value : EXPORT_MODE_LEGACY;
        },

        shouldDownloadImages: function() {
            return this.getExportMode() === EXPORT_MODE_DUAL_ZIP
                && !!document.getElementById('download-images')
                && document.getElementById('download-images').checked;
        },

        getSaveTarget: function() {
            if (this.getExportMode() !== EXPORT_MODE_DUAL_ZIP) return 'download';
            const selected = document.querySelector('input[name="save-target"]:checked');
            return selected ? selected.value : 'download';
        },

        isDirectoryWriteSupported: function() {
            return typeof window.showDirectoryPicker === 'function' && window.isSecureContext !== false;
        },

        updateDirectoryLabel: function(message) {
            if (this.ui.currentFolderText) {
                this.ui.currentFolderText.textContent = message;
            }
        },

        toast: function(message, type) {
            if (!this.ui.toastWrap) return;

            const palette = {
                info: { bg: '#eef4ff', border: '#b8d0ff', color: '#1d4ed8' },
                success: { bg: '#eefbf3', border: '#b7e6c9', color: '#0f8a4b' },
                warning: { bg: '#fff8e8', border: '#f4d48f', color: '#9a6700' },
                error: { bg: '#fff1f0', border: '#f0b6b0', color: '#c63c32' }
            };
            const style = palette[type] || palette.info;
            const toast = document.createElement('div');
            toast.textContent = message;
            Object.assign(toast.style, {
                maxWidth: '320px',
                padding: '10px 12px',
                backgroundColor: style.bg,
                color: style.color,
                border: '1px solid ' + style.border,
                borderRadius: '10px',
                boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
                fontSize: '12px',
                lineHeight: '1.5',
                pointerEvents: 'auto'
            });
            this.ui.toastWrap.appendChild(toast);

            setTimeout(() => {
                toast.remove();
            }, 3200);
        },

        chooseDirectory: async function() {
            if (!this.isDirectoryWriteSupported()) {
                this.toast('当前浏览器不支持目录写入，已回退为普通下载。', 'warning');
                this.saveTarget = 'download';
                if (this.ui.saveDownloadMode) this.ui.saveDownloadMode.checked = true;
                if (this.ui.refreshModeOptions) this.ui.refreshModeOptions();
                return null;
            }

            try {
                const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                const granted = await this.ensureDirectoryPermission(handle);
                if (!granted) {
                    this.toast('目录授权被拒绝，仍会使用普通下载。', 'warning');
                    return null;
                }

                this.directoryHandle = handle;
                this.updateDirectoryLabel('当前文件夹：' + (handle.name || '已选择目录'));
                this.toast('目录选择成功：' + (handle.name || '已选择目录'), 'success');
                if (this.ui.refreshModeOptions) this.ui.refreshModeOptions();
                return handle;
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    this.toast('已取消选择文件夹。', 'info');
                    return null;
                }
                console.warn('Choose directory failed:', error);
                this.toast('选择文件夹失败，请稍后重试。', 'error');
                return null;
            }
        },

        ensureDirectoryPermission: async function(handle) {
            if (!handle) return false;
            if (typeof handle.queryPermission === 'function') {
                const current = await handle.queryPermission({ mode: 'readwrite' });
                if (current === 'granted') return true;
            }
            if (typeof handle.requestPermission === 'function') {
                const requested = await handle.requestPermission({ mode: 'readwrite' });
                return requested === 'granted';
            }
            return true;
        },

        resetRunWarnings: function() {
            this.runWarnings = [];
        },

        addRunWarning: function(message) {
            if (!message) return;
            if (!this.runWarnings.includes(message)) this.runWarnings.push(message);
        },

        formatRunWarningSummary: function() {
            if (!this.runWarnings.length) return '';
            if (this.runWarnings.length === 1) return this.runWarnings[0];
            return this.runWarnings[0] + ' 等 ' + this.runWarnings.length + ' 项警告';
        },

        setProgress: function(pct, text, stage) {
            this.ui.progressBar.style.width = pct + '%';
            if (text) this.ui.progressText.textContent = text;
            if (stage !== undefined) this.ui.stageText.textContent = stage;
        },

        lockUI: function() {
            this.ui.exportBtn.disabled = true;
            this.ui.exportBtn.style.opacity = '0.6';
            this.ui.exportBtn.style.cursor = 'not-allowed';
            this.ui.cancelBtn.style.display = 'block';
            this.ui.progressDiv.style.display = 'block';
        },

        resetUI: function(delay) {
            setTimeout(() => {
                this.ui.progressDiv.style.display = 'none';
                this.ui.cancelBtn.style.display = 'none';
                this.ui.exportBtn.disabled = false;
                this.ui.exportBtn.style.opacity = '1';
                this.ui.exportBtn.style.cursor = 'pointer';
            }, delay || 0);
        },

        saveZipBlob: async function(blob, fileName) {
            const saveTarget = this.getSaveTarget();
            if (saveTarget !== 'directory') {
                this.downloadBlob(blob, fileName);
                return 'download';
            }

            if (!this.isDirectoryWriteSupported()) {
                this.toast('当前浏览器不支持目录写入，已回退普通下载。', 'warning');
                this.downloadBlob(blob, fileName);
                return 'fallback-download';
            }

            if (!this.directoryHandle) {
                this.toast('请先选择文件夹，当前已回退为普通下载。', 'warning');
                this.downloadBlob(blob, fileName);
                return 'fallback-download';
            }

            try {
                const granted = await this.ensureDirectoryPermission(this.directoryHandle);
                if (!granted) {
                    this.toast('目录授权被拒绝，已回退为普通下载。', 'warning');
                    this.downloadBlob(blob, fileName);
                    return 'fallback-download';
                }

                this.setProgress(99, '正在写入指定文件夹...', this.directoryHandle.name || '本地目录');
                await this.writeBlobToDirectory(this.directoryHandle, fileName, blob);
                this.toast('已写入文件夹：' + (this.directoryHandle.name || '本地目录'), 'success');
                return 'directory';
            } catch (error) {
                console.warn('Write zip to directory failed:', error);
                this.toast('写入文件夹失败，已回退为普通下载。', 'error');
                this.downloadBlob(blob, fileName);
                return 'fallback-download';
            }
        },

        writeBlobToDirectory: async function(directoryHandle, fileName, blob) {
            const safeName = this.sanitizeFileName(fileName).substring(0, 140);
            const fileHandle = await directoryHandle.getFileHandle(safeName, { create: true });
            const writable = await fileHandle.createWritable();
            try {
                await writable.write(blob);
                await writable.close();
            } catch (error) {
                try { await writable.abort(); } catch (abortError) {}
                throw error;
            }
        },

        // ==================== 答主页导出 ====================
        startPersonExport: async function() {
            this.aborted = false;
            this.stats = { answers: 0, articles: 0, pins: 0 };
            this.resetRunWarnings();

            const expAnswers = document.getElementById('exp-answers').checked;
            const expArticles = document.getElementById('exp-articles').checked;
            const expPins = document.getElementById('exp-pins').checked;
            const exportMode = this.getExportMode();
            CONFIG.linkStyle = (document.querySelector('input[name="link-style"]:checked') || {}).value || 'obsidian';
            CONFIG.exportMode = exportMode;
            CONFIG.downloadImages = this.shouldDownloadImages();

            if (!expAnswers && !expArticles && !expPins) {
                alert('请至少选择一种内容类型！'); return;
            }

            this.lockUI();
            this.setProgress(0, '正在获取用户信息...', '');

            try {
                const userInfo = await this.fetchPersonInfo();
                const authorName = userInfo.name || this.urlToken;

                const totalTasks =
                    (expAnswers ? (userInfo.answer_count || 0) : 0) +
                    (expArticles ? (userInfo.articles_count || 0) : 0) +
                    (expPins ? (userInfo.pins_count || 0) : 0);
                let processed = 0;

                if (exportMode === EXPORT_MODE_LEGACY && totalTasks > CONFIG.largeLegacySoftLimit) {
                    this.addRunWarning('当前内容量较大，单 Markdown 模式可能占用较多内存，建议改用 Zip 模式');
                }

                const allAnswers = [], allArticles = [], allPins = [];

                // ---- 回答 ----
                if (expAnswers && !this.aborted) {
                    const total = userInfo.answer_count || '?';
                    this.setProgress(0, '正在导出回答...', '0 / ' + total);
                    const items = await this.fetchAllPaged(
                        this.memberApiUrl(this.urlToken, '/answers'),
                        { include: 'data[*].content,voteup_count,created_time,updated_time,comment_count,question.id,question.title', limit: 20, sort_by: 'created' },
                        (c) => {
                            processed++;
                            this.setProgress(
                                this.calcFetchProgress(processed, Math.max(totalTasks, processed)),
                                '正在导出回答...',
                                this.formatFetchCount(c, total)
                            );
                        }
                    );
                    allAnswers.push(...items);
                    this.stats.answers = allAnswers.length;
                }

                // ---- 文章 ----
                if (expArticles && !this.aborted) {
                    const total = userInfo.articles_count || '?';
                    this.setProgress(this.calcFetchProgress(processed, totalTasks), '正在导出文章...', '0 / '+total);
                    const items = await this.fetchAllPaged(
                        this.memberApiUrl(this.urlToken, '/articles'),
                        { include: 'data[*].content,voteup_count,created,updated,comment_count,title', limit: 20, sort_by: 'created' },
                        (c) => {
                            processed++;
                            this.setProgress(
                                this.calcFetchProgress(processed, Math.max(totalTasks, processed)),
                                '正在导出文章...',
                                this.formatFetchCount(c, total)
                            );
                        }
                    );
                    allArticles.push(...items);
                    this.stats.articles = allArticles.length;
                }

                // ---- 想法 ----
                if (expPins && !this.aborted) {
                    const total = userInfo.pins_count || '?';
                    this.setProgress(this.calcFetchProgress(processed, totalTasks), '正在导出想法...', '0 / '+total);
                    const items = await this.fetchAllPaged(
                        this.memberApiUrl(this.urlToken, '/pins'),
                        { limit: 20 },
                        (c) => {
                            processed++;
                            this.setProgress(
                                this.calcFetchProgress(processed, Math.max(totalTasks, processed)),
                                '正在导出想法...',
                                this.formatFetchCount(c, total)
                            );
                        }
                    );
                    allPins.push(...items);
                    this.stats.pins = allPins.length;
                }

                if (this.aborted) { this.setProgress(0, '导出已取消', ''); this.resetUI(2000); return; }
                const contentItems = this.normalizePersonItems(authorName, userInfo, allAnswers, allArticles, allPins);
                const context = this.buildPersonExportContext(authorName, userInfo, contentItems);

                if (exportMode === EXPORT_MODE_DUAL_ZIP) {
                    this.setProgress(97, '正在构建 NotebookLM + Obsidian Zip...', '整理知识结构');
                    await this.exportDualPackage(context);
                    this.setProgress(100, '✅ 导出完成！',
                        this.formatRunWarningSummary() || '已生成学习包 Zip');
                } else {
                    this.setProgress(98, '正在生成 Markdown...', '');
                    const md = this.genPersonMarkdown(authorName, userInfo, allAnswers, allArticles, allPins);
                    this.downloadTextFile(md, authorName + '_内容合集.md');
                    const legacySummary = '回答: ' + this.stats.answers + ' | 文章: ' + this.stats.articles + ' | 想法: ' + this.stats.pins;
                    this.setProgress(100, '✅ 导出完成！',
                        this.formatRunWarningSummary() || legacySummary);
                }

            } catch (err) {
                console.error('导出失败:', err);
                this.setProgress(0, '❌ 导出失败: ' + err.message, '');
            } finally {
                this.resetUI(5000);
            }
        },

        // ==================== 问题页导出 ====================
        startQuestionExport: async function() {
            this.aborted = false;
            this.stats = { answers: 0, articles: 0, pins: 0 };
            this.resetRunWarnings();

            const sortEl = document.querySelector('input[name="q-sort"]:checked');
            const sortBy = sortEl ? sortEl.value : 'default';
            const includeDetail = document.getElementById('exp-q-detail') ? document.getElementById('exp-q-detail').checked : true;
            const exportMode = this.getExportMode();
            CONFIG.linkStyle = (document.querySelector('input[name="link-style"]:checked') || {}).value || 'obsidian';
            CONFIG.exportMode = exportMode;
            CONFIG.downloadImages = this.shouldDownloadImages();

            this.lockUI();
            this.setProgress(0, '正在获取问题信息...', '');

            try {
                // 获取问题信息
                const qResp = await fetch(
                    '/api/v4/questions/' + this.questionId +
                    '?include=' + encodeURIComponent('detail,answer_count,comment_count,follower_count,title,created,updated_time')
                );
                if (!qResp.ok) throw new Error('获取问题信息失败: ' + qResp.status);
                const qInfo = await qResp.json();
                const qTitle = qInfo.title || '未知问题';
                const totalAnswers = qInfo.answer_count || 0;

                if (exportMode === EXPORT_MODE_LEGACY && totalAnswers > CONFIG.largeLegacySoftLimit) {
                    this.addRunWarning('回答数量较多，单 Markdown 模式可能较重，建议改用 Zip 模式');
                }

                this.setProgress(5, '正在导出回答...', '0 / ' + totalAnswers);

                // 获取所有回答
                const allAnswers = await this.fetchAllPaged(
                    '/api/v4/questions/' + this.questionId + '/answers',
                    {
                        include: 'data[*].content,voteup_count,created_time,updated_time,comment_count,author.name,author.headline,author.url_token',
                        limit: 20,
                        sort_by: sortBy
                    },
                    (count) => {
                        const pct = totalAnswers > 0 ? Math.min(5 + (count / totalAnswers) * 90, 95) : 50;
                        this.setProgress(pct.toFixed(1), '正在导出回答...', count + ' / ' + totalAnswers);
                    }
                );
                this.stats.answers = allAnswers.length;

                if (this.aborted) { this.setProgress(0, '导出已取消', ''); this.resetUI(2000); return; }
                if (exportMode === EXPORT_MODE_DUAL_ZIP) {
                    this.setProgress(96, '正在构建 NotebookLM + Obsidian Zip...', '整理回答知识结构');
                    const items = this.normalizeQuestionItems(qInfo, allAnswers);
                    const context = this.buildQuestionExportContext(qInfo, items, includeDetail, sortBy);
                    await this.exportDualPackage(context);
                    this.setProgress(100, '✅ 导出完成！',
                        this.formatRunWarningSummary() || '已生成问题学习包 Zip');
                } else {
                    this.setProgress(96, '正在生成 Markdown...', '');
                    const md = this.genQuestionMarkdown(qInfo, allAnswers, includeDetail, sortBy);
                    this.downloadTextFile(md, qTitle + '_' + allAnswers.length + '个回答.md');
                    this.setProgress(100, '✅ 导出完成！',
                        this.formatRunWarningSummary() || ('共 ' + allAnswers.length + ' 个回答'));
                }

            } catch (err) {
                console.error('导出失败:', err);
                this.setProgress(0, '❌ 导出失败: ' + err.message, '');
            } finally {
                this.resetUI(5000);
            }
        },

        // ==================== API 分页请求 ====================
        fetchPersonInfo: async function() {
            const include = 'answer_count,articles_count,pins_count,name,headline,description,follower_count';
            const requestUrl = this.memberApiUrl(this.urlToken) + '?include=' + encodeURIComponent(include);

            try {
                const userInfo = await this.requestJsonWithRetry(requestUrl, { label: '获取用户信息' });
                return this.applyResolvedPersonInfo(userInfo);
            } catch (error) {
                const fallbackInfo = this.getPersonInfoFromPageState();
                if (fallbackInfo && fallbackInfo.name) {
                    this.addRunWarning('用户信息接口不可用，已从当前页面恢复用户信息');
                    console.warn('User info API failed, using page state fallback:', error);
                    return this.applyResolvedPersonInfo(fallbackInfo);
                }
                throw error;
            }
        },

        applyResolvedPersonInfo: function(userInfo) {
            const normalized = this.normalizePersonInfo(userInfo);
            if (normalized.url_token && normalized.url_token !== this.urlToken) {
                this.urlToken = normalized.url_token;
            }
            return normalized;
        },

        memberApiUrl: function(urlToken, suffix) {
            return '/api/v4/members/' + encodeURIComponent(urlToken || '') + (suffix || '');
        },

        fetchAllPaged: async function(baseUrl, params, onItem) {
            const allItems = [];
            let offset = 0;
            const limit = params.limit || 20;
            let count = 0;
            let nextUrl = '';
            const seenPages = new Set();
            const seenItems = new Set();

            while (true) {
                if (this.aborted) break;

                const urlParams = new URLSearchParams({ ...params, offset: String(offset), limit: String(limit) });
                const requestUrl = nextUrl || (baseUrl + '?' + urlParams.toString());
                if (seenPages.has(requestUrl)) {
                    this.addRunWarning('检测到分页循环，已停止继续请求');
                    break;
                }
                seenPages.add(requestUrl);

                const data = await this.requestJsonWithRetry(requestUrl, {
                    label: '分页请求',
                    offset: offset
                });
                if (!data.data || data.data.length === 0) break;

                for (const item of data.data) {
                    const itemKey = this.pagedItemKey(baseUrl, item);
                    if (itemKey && seenItems.has(itemKey)) continue;
                    if (itemKey) seenItems.add(itemKey);
                    allItems.push(item);
                    count++;
                    if (onItem) onItem(count);
                }

                if (data.paging && data.paging.is_end) break;
                nextUrl = data.paging && data.paging.next ? data.paging.next : '';
                offset += limit;
                await this.delay(CONFIG.requestDelay);
            }
            return allItems;
        },

        pagedItemKey: function(baseUrl, item) {
            if (!item) return '';
            const type = baseUrl || 'paged';
            if (item.id != null) return type + ':id:' + item.id;
            if (item.url) return type + ':url:' + item.url;
            if (item.url_token) return type + ':token:' + item.url_token;
            return '';
        },

        requestJsonWithRetry: async function(url, options) {
            const maxAttempts = Math.max(1, CONFIG.maxRequestRetries);
            const label = options && options.label ? options.label : '请求';
            const offset = options && options.offset != null ? options.offset : null;
            let lastError = null;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                if (this.aborted) throw new Error('导出已取消');

                try {
                    const resp = await this.fetchWithTimeout(url, CONFIG.requestTimeoutMs);

                    if (!resp.ok) {
                        if (resp.status === 429) {
                            const waitMs = Math.max(3000, CONFIG.retryBaseDelay * attempt);
                            this.addRunWarning('请求触发限流，已自动重试');
                            console.warn('限流，等待重试...', url, 'attempt=', attempt);
                            await this.delay(waitMs);
                            continue;
                        }

                        if (this.isRetryableStatus(resp.status) && attempt < maxAttempts) {
                            const waitMs = CONFIG.retryBaseDelay * attempt;
                            this.addRunWarning('请求出现临时错误，已自动重试');
                            console.warn(label + '失败，准备重试:', resp.status, url, 'attempt=', attempt);
                            await this.delay(waitMs);
                            continue;
                        }

                        throw new Error(label + '失败: HTTP ' + resp.status + (offset != null ? ('，offset=' + offset) : ''));
                    }

                    return await resp.json();
                } catch (error) {
                    lastError = error;
                    const isAbort = error && (error.name === 'AbortError' || /超时/.test(error.message || ''));
                    const canRetry = attempt < maxAttempts;

                    if (canRetry) {
                        const waitMs = CONFIG.retryBaseDelay * attempt;
                        if (isAbort) this.addRunWarning('请求超时，已自动重试');
                        console.warn(label + '异常，准备重试:', error, 'attempt=', attempt, 'url=', url);
                        await this.delay(waitMs);
                        continue;
                    }

                    break;
                }
            }

            throw new Error(
                label + '多次重试后仍失败'
                + (offset != null ? ('，offset=' + offset) : '')
                + (lastError && lastError.message ? ('：' + lastError.message) : '')
            );
        },

        fetchWithTimeout: async function(url, timeoutMs) {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
            try {
                const response = await fetch(url, {
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'X-Requested-With': 'fetch'
                    },
                    signal: controller ? controller.signal : undefined
                });
                return response;
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    throw new Error('请求超时');
                }
                throw error;
            } finally {
                if (timer) clearTimeout(timer);
            }
        },

        isRetryableStatus: function(status) {
            return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
        },

        getPersonInfoFromPageState: function() {
            const state = this.readInitialState();
            if (!state) return null;

            const candidates = [];
            const seen = new Set();
            const targetToken = this.urlToken;
            const visit = (value, depth) => {
                if (!value || depth > 8) return;
                if (Array.isArray(value)) {
                    value.forEach((item) => visit(item, depth + 1));
                    return;
                }
                if (typeof value !== 'object') return;
                if (seen.has(value)) return;
                seen.add(value);

                const candidate = this.normalizePersonInfo(value);
                const tokenMatches = candidate.url_token && candidate.url_token === targetToken;
                const hasProfileShape = candidate.name && (
                    candidate.answer_count != null
                    || candidate.articles_count != null
                    || candidate.pins_count != null
                    || candidate.follower_count != null
                    || candidate.headline
                );
                if (tokenMatches || hasProfileShape) {
                    candidates.push(candidate);
                }

                Object.keys(value).forEach((key) => visit(value[key], depth + 1));
            };

            visit(state, 0);
            candidates.sort((a, b) => this.personInfoScore(b, targetToken) - this.personInfoScore(a, targetToken));
            return candidates[0] || null;
        },

        readInitialState: function() {
            if (typeof window !== 'undefined' && window.__INITIAL_STATE__) return window.__INITIAL_STATE__;

            const jsonNode = document.getElementById('js-initialData');
            if (jsonNode && jsonNode.textContent) {
                try { return JSON.parse(jsonNode.textContent); } catch (error) {}
            }

            const scripts = Array.from(document.querySelectorAll('script'));
            for (const script of scripts) {
                const text = script.textContent || '';
                const match = text.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
                if (!match) continue;
                try { return JSON.parse(match[1]); } catch (error) {}
            }

            return null;
        },

        normalizePersonInfo: function(raw) {
            const source = raw || {};
            return {
                id: source.id || '',
                url_token: source.url_token || source.urlToken || this.extractPeopleToken(source.url || source.url_path || ''),
                name: source.name || source.fullname || '',
                headline: source.headline || source.headline_render || '',
                description: source.description || source.description_render || '',
                answer_count: this.numberOrZero(source.answer_count != null ? source.answer_count : source.answerCount),
                articles_count: this.numberOrZero(source.articles_count != null ? source.articles_count : source.articlesCount),
                pins_count: this.numberOrZero(source.pins_count != null ? source.pins_count : source.pinsCount),
                follower_count: this.numberOrZero(source.follower_count != null ? source.follower_count : source.followerCount)
            };
        },

        personInfoScore: function(info, targetToken) {
            let score = 0;
            if (info.url_token === targetToken) score += 100;
            if (info.name) score += 20;
            if (info.answer_count) score += 10;
            if (info.articles_count) score += 5;
            if (info.pins_count) score += 5;
            if (info.headline) score += 3;
            return score;
        },

        buildPersonExportContext: function(authorName, userInfo, items) {
            return {
                kind: 'person',
                title: authorName,
                sourceUrl: 'https://www.zhihu.com/people/' + this.urlToken,
                authorName: authorName,
                authorToken: this.urlToken,
                authorHeadline: userInfo.headline || '',
                authorDescription: userInfo.description || '',
                stats: { ...this.stats },
                items: items,
                includeDetail: false,
                sortBy: 'created',
                questionNote: null
            };
        },

        buildQuestionExportContext: function(qInfo, items, includeDetail, sortBy) {
            const detailMarkdown = includeDetail && qInfo.detail ? this.html2md(qInfo.detail) : '';
            return {
                kind: 'question',
                title: qInfo.title || '未知问题',
                sourceUrl: 'https://www.zhihu.com/question/' + this.questionId,
                questionId: this.questionId,
                questionInfo: qInfo,
                stats: { answers: items.length, articles: 0, pins: 0 },
                items: items,
                includeDetail: includeDetail,
                sortBy: sortBy,
                questionNote: {
                    title: qInfo.title || '未知问题',
                    detailMarkdown: detailMarkdown,
                    detailHtml: qInfo.detail || '',
                    imageRefs: includeDetail ? this.extractImagesFromHtml(qInfo.detail || '') : []
                }
            };
        },

        normalizePersonItems: function(authorName, userInfo, answers, articles, pins) {
            const items = [];
            const authorMeta = {
                name: authorName,
                token: this.urlToken,
                headline: userInfo.headline || ''
            };

            answers.forEach((answer, index) => {
                items.push(this.createAnswerItem(answer, {
                    order: index,
                    authorName: authorMeta.name,
                    authorToken: authorMeta.token,
                    authorHeadline: authorMeta.headline
                }));
            });

            articles.forEach((article, index) => {
                items.push(this.createArticleItem(article, {
                    order: index,
                    authorName: authorMeta.name,
                    authorToken: authorMeta.token,
                    authorHeadline: authorMeta.headline
                }));
            });

            pins.forEach((pin, index) => {
                items.push(this.createPinItem(pin, {
                    order: index,
                    authorName: authorMeta.name,
                    authorToken: authorMeta.token,
                    authorHeadline: authorMeta.headline
                }));
            });

            return items.sort((a, b) => this.compareByCreatedDesc(a, b));
        },

        normalizeQuestionItems: function(qInfo, answers) {
            const items = answers.map((answer, index) => this.createAnswerItem(answer, {
                order: index,
                questionId: this.questionId,
                questionTitle: qInfo.title || '未知问题'
            }));
            return items.sort((a, b) => this.compareByCreatedDesc(a, b));
        },

        createAnswerItem: function(answer, options) {
            const authorName = options.authorName || (answer.author && answer.author.name) || '匿名用户';
            const fallbackTitle = options.questionTitle && (!answer.question || !answer.question.title)
                ? (authorName + ' · ' + options.questionTitle)
                : this.ansTitle(answer);
            const markdownContent = this.html2md(answer.content || '*（内容为空）*');
            return this.finalizeItem({
                id: String(answer.id || ('answer-' + (options.order + 1))),
                type: 'answer',
                order: options.order || 0,
                title: fallbackTitle,
                sourceUrl: this.ansUrl(answer),
                authorName: authorName,
                authorToken: options.authorToken || (answer.author && answer.author.url_token) || '',
                authorHeadline: options.authorHeadline || (answer.author && answer.author.headline) || '',
                questionId: options.questionId || (answer.question && answer.question.id) || '',
                questionTitle: options.questionTitle || (answer.question && answer.question.title) || '',
                createdAt: this.normalizeTime(answer.created_time),
                updatedAt: this.normalizeTime(answer.updated_time),
                voteCount: answer.voteup_count != null ? answer.voteup_count : 0,
                commentCount: answer.comment_count != null ? answer.comment_count : 0,
                htmlContent: answer.content || '',
                markdownContent: markdownContent,
                imageRefs: this.extractImagesFromHtml(answer.content || '')
            });
        },

        createArticleItem: function(article, options) {
            const markdownContent = this.html2md(article.content || '*（内容为空）*');
            return this.finalizeItem({
                id: String(article.id || ('article-' + (options.order + 1))),
                type: 'article',
                order: options.order || 0,
                title: article.title || '无标题',
                sourceUrl: this.artUrl(article),
                authorName: options.authorName || '未知作者',
                authorToken: options.authorToken || '',
                authorHeadline: options.authorHeadline || '',
                questionId: '',
                questionTitle: '',
                createdAt: this.normalizeTime(article.created),
                updatedAt: this.normalizeTime(article.updated),
                voteCount: article.voteup_count != null ? article.voteup_count : 0,
                commentCount: article.comment_count != null ? article.comment_count : 0,
                htmlContent: article.content || '',
                markdownContent: markdownContent,
                imageRefs: this.extractImagesFromHtml(article.content || '')
            });
        },

        createPinItem: function(pin, options) {
            const preview = this.pinPreview(pin);
            const markdownContent = this.pinContent(pin);
            return this.finalizeItem({
                id: String(pin.id || ('pin-' + (options.order + 1))),
                type: 'pin',
                order: options.order || 0,
                title: preview ? ('想法：' + preview) : ('想法 ' + (options.order + 1)),
                sourceUrl: pin.id ? ('https://www.zhihu.com/pin/' + pin.id) : '',
                authorName: options.authorName || '未知作者',
                authorToken: options.authorToken || '',
                authorHeadline: options.authorHeadline || '',
                questionId: '',
                questionTitle: '',
                createdAt: this.normalizeTime(pin.created),
                updatedAt: this.normalizeTime(pin.updated_time || pin.updated),
                voteCount: pin.like_count != null ? pin.like_count : (pin.reaction_count != null ? pin.reaction_count : 0),
                commentCount: pin.comment_count != null ? pin.comment_count : 0,
                htmlContent: '',
                markdownContent: markdownContent,
                imageRefs: this.extractImagesFromPin(pin)
            });
        },

        finalizeItem: function(item) {
            const imageRefs = this.uniqueImageRefs(item.imageRefs || []);
            const plainText = this.stripMarkdown(item.markdownContent || '');
            const safeTitle = this.sanitizeFileName(item.title || (TYPE_LABELS[item.type] + '-' + item.id)).substring(0, 72) || (item.type + '-' + item.id);
            return {
                ...item,
                imageRefs: imageRefs,
                plainText: plainText,
                summary: this.truncate(plainText, 220),
                fileBaseName: safeTitle
            };
        },

        exportDualPackage: async function(context) {
            if (typeof JSZip === 'undefined') {
                throw new Error('JSZip 未加载成功，请重新安装脚本后重试。');
            }

            const zip = new JSZip();
            const rootName = this.buildRootFolderName(context);
            const root = zip.folder(rootName);
            const exportedAt = new Date();
            const exportedAtIso = exportedAt.toISOString();
            const exportedAtLabel = exportedAt.toLocaleString('zh-CN');

            this.assignObsidianPaths(context);

            let assetMap = {};
            const assetPlan = CONFIG.downloadImages ? this.collectAssetPlan(context) : [];
            if (CONFIG.downloadImages && assetPlan.length > 0) {
                assetMap = await this.downloadAssets(assetPlan, root, (done, total) => {
                    this.setProgress(97, '正在下载图片资源...', done + ' / ' + total);
                });
            }

            const obsidianFiles = this.buildObsidianFiles(context, assetMap, exportedAtIso, exportedAtLabel);
            const notebookFiles = this.buildNotebookLMFiles(context, assetMap, exportedAtIso, exportedAtLabel);

            obsidianFiles.forEach((file) => root.file('obsidian/' + file.path, file.content));
            notebookFiles.forEach((file) => root.file('notebooklm/' + file.path, file.content));

            const manifest = this.buildManifest(rootName, context, obsidianFiles, notebookFiles, assetMap, exportedAtIso);
            root.file('manifest.json', JSON.stringify(manifest, null, 2));

            this.setProgress(99, '正在打包 Zip...', (obsidianFiles.length + notebookFiles.length + 1) + ' 个文件');
            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });
            await this.saveZipBlob(blob, rootName + '.zip');
        },

        assignObsidianPaths: function(context) {
            const counters = { answer: 0, article: 0, pin: 0 };
            context.items.forEach((item) => {
                counters[item.type] += 1;
                const index = String(counters[item.type]).padStart(3, '0');
                const folder = item.type === 'answer' ? 'answers' : item.type === 'article' ? 'articles' : 'pins';
                item.obsidianRelPath = folder + '/' + index + ' - ' + item.fileBaseName + '.md';
            });
        },

        collectAssetPlan: function(context) {
            const byUrl = new Map();
            const register = (ref, ownerId) => {
                const normalizedUrl = this.normalizeAssetUrl(ref.url || '');
                if (!normalizedUrl) return;
                if (!byUrl.has(normalizedUrl)) {
                    byUrl.set(normalizedUrl, {
                        url: normalizedUrl,
                        alt: ref.alt || '图片',
                        owners: new Set([ownerId]),
                        zipPath: 'assets/images/' + this.generateImageBaseName(normalizedUrl)
                    });
                } else {
                    const existing = byUrl.get(normalizedUrl);
                    existing.owners.add(ownerId);
                    if (!existing.alt && ref.alt) existing.alt = ref.alt;
                }
            };

            context.items.forEach((item) => {
                item.imageRefs.forEach((ref) => register(ref, item.id));
            });

            if (context.questionNote && context.questionNote.imageRefs) {
                context.questionNote.imageRefs.forEach((ref) => register(ref, 'question-note'));
            }

            return Array.from(byUrl.values());
        },

        downloadAssets: async function(assetPlan, root, onProgress) {
            const assetMap = {};
            let done = 0;
            let failedCount = 0;

            await this.runWithConcurrency(assetPlan, 3, async (asset) => {
                if (this.aborted) return;

                try {
                    const response = await this.requestBinary(asset.url);
                    const extension = this.resolveImageExtension(asset.url, response.contentType);
                    const finalZipPath = asset.zipPath + '.' + extension;
                    root.file(finalZipPath, response.buffer);
                    assetMap[asset.url] = {
                        status: 'ok',
                        url: asset.url,
                        alt: asset.alt || '图片',
                        zipPath: finalZipPath,
                        owners: Array.from(asset.owners),
                        contentType: response.contentType || ''
                    };
                } catch (error) {
                    console.warn('Image download failed:', asset.url, error);
                    failedCount += 1;
                    assetMap[asset.url] = {
                        status: 'failed',
                        url: asset.url,
                        alt: asset.alt || '图片',
                        zipPath: '',
                        owners: Array.from(asset.owners),
                        error: error.message
                    };
                } finally {
                    done += 1;
                    if (onProgress) onProgress(done, assetPlan.length);
                }
            });

            if (failedCount > 0) {
                this.addRunWarning('有 ' + failedCount + ' 张图片下载失败，已回退为外链');
            }

            return assetMap;
        },

        buildObsidianFiles: function(context, assetMap, exportedAtIso, exportedAtLabel) {
            const files = [];

            if (context.kind === 'question') {
                files.push({
                    path: 'question/00_Question.md',
                    content: this.renderQuestionNote(context, assetMap, exportedAtIso, exportedAtLabel)
                });
            }

            context.items.forEach((item) => {
                files.push({
                    path: item.obsidianRelPath,
                    content: this.renderObsidianItemNote(item, context, assetMap, exportedAtIso, exportedAtLabel)
                });
            });

            files.unshift({
                path: '01_Topics.md',
                content: this.renderObsidianTopics(context)
            });
            files.unshift({
                path: '00_Index.md',
                content: this.renderObsidianIndex(context, exportedAtLabel)
            });

            return files;
        },

        buildNotebookLMFiles: function(context, assetMap, exportedAtIso, exportedAtLabel) {
            const files = [];
            files.push({
                path: '00_Overview.md',
                content: this.renderNotebookOverview(context, exportedAtLabel)
            });
            files.push({
                path: '01_Study_Prompts.md',
                content: this.renderNotebookPrompts(context)
            });

            const groupedSources = this.buildNotebookGroups(context.items);
            groupedSources.forEach((group, index) => {
                files.push({
                    path: 'source-' + String(index + 1).padStart(2, '0') + '.md',
                    content: this.renderNotebookSource(context, group, assetMap, exportedAtIso, exportedAtLabel, index + 1)
                });
            });

            return files;
        },

        renderObsidianIndex: function(context, exportedAtLabel) {
            const lines = [];
            const topItems = context.items.slice().sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0)).slice(0, 10);
            const latestItems = context.items.slice().sort((a, b) => this.compareByCreatedDesc(a, b)).slice(0, 10);

            lines.push('# ' + context.title + ' · 导出索引');
            lines.push('');
            lines.push('> [!info] Export Summary');
            lines.push('> Source: [' + context.title + '](' + context.sourceUrl + ')');
            lines.push('> Exported: ' + exportedAtLabel);
            lines.push('> Mode: NotebookLM + Obsidian Zip');
            lines.push('> Stats: 回答 ' + context.stats.answers + ' · 文章 ' + context.stats.articles + ' · 想法 ' + context.stats.pins);
            if (context.kind === 'question') {
                lines.push('> Question Note: [[question/00_Question|问题概览]]');
            }
            lines.push('');
            lines.push('## 高赞优先');
            lines.push('');

            if (topItems.length === 0) {
                lines.push('- 暂无内容');
            } else {
                topItems.forEach((item, index) => {
                    lines.push(
                        (index + 1) + '. ' +
                        this.obsidianWikiLink(item.obsidianRelPath, TYPE_LABELS[item.type] + ' · ' + item.title) +
                        ' · 👍 ' + (item.voteCount || 0)
                    );
                });
            }
            lines.push('');
            lines.push('## 最新更新');
            lines.push('');
            latestItems.forEach((item, index) => {
                lines.push(
                    (index + 1) + '. ' +
                    this.obsidianWikiLink(item.obsidianRelPath, TYPE_LABELS[item.type] + ' · ' + item.title) +
                    ' · ' + this.displayDate(item.createdAt)
                );
            });
            lines.push('');

            const grouped = this.groupItemsByType(context.items);
            ['answer', 'article', 'pin'].forEach((type) => {
                const items = grouped[type];
                if (!items || items.length === 0) return;
                lines.push('## ' + TYPE_LABELS[type] + '（' + items.length + '）');
                lines.push('');
                items.forEach((item, index) => {
                    lines.push(
                        (index + 1) + '. ' +
                        this.obsidianWikiLink(item.obsidianRelPath, item.title) +
                        ' · 👍 ' + (item.voteCount || 0) +
                        ' · ' + this.displayDate(item.createdAt)
                    );
                });
                lines.push('');
            });

            lines.push('## 使用建议');
            lines.push('');
            lines.push('- 在 Obsidian 中先打开 `00_Index.md`，再根据高赞和时间线进入单条笔记。');
            lines.push('- 如果要导入 NotebookLM，请优先使用 `../notebooklm` 目录中的文件。');
            lines.push('');
            return lines.join('\n');
        },

        renderObsidianTopics: function(context) {
            const lines = [];
            const groupedByMonth = new Map();

            context.items
                .slice()
                .sort((a, b) => this.compareByCreatedDesc(a, b))
                .forEach((item) => {
                    const monthKey = this.monthKey(item.createdAt);
                    if (!groupedByMonth.has(monthKey)) groupedByMonth.set(monthKey, []);
                    groupedByMonth.get(monthKey).push(item);
                });

            lines.push('# 主题视图');
            lines.push('');
            lines.push('## 按类型浏览');
            lines.push('');

            const groupedByType = this.groupItemsByType(context.items);
            ['answer', 'article', 'pin'].forEach((type) => {
                const items = groupedByType[type];
                if (!items || items.length === 0) return;
                lines.push('### ' + TYPE_LABELS[type]);
                lines.push('');
                items
                    .slice()
                    .sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0))
                    .slice(0, 15)
                    .forEach((item, index) => {
                        lines.push(
                            (index + 1) + '. ' +
                            this.obsidianWikiLink(item.obsidianRelPath, item.title) +
                            ' · 👍 ' + (item.voteCount || 0)
                        );
                    });
                lines.push('');
            });

            lines.push('## 时间线');
            lines.push('');
            Array.from(groupedByMonth.keys()).sort().reverse().forEach((key) => {
                lines.push('### ' + key);
                lines.push('');
                groupedByMonth.get(key).forEach((item) => {
                    lines.push(
                        '- ' +
                        this.obsidianWikiLink(item.obsidianRelPath, TYPE_LABELS[item.type] + ' · ' + item.title) +
                        ' · ' + this.displayDate(item.createdAt)
                    );
                });
                lines.push('');
            });

            return lines.join('\n');
        },

        renderQuestionNote: function(context, assetMap, exportedAtIso, exportedAtLabel) {
            const qInfo = context.questionInfo || {};
            const detailMarkdown = this.rewriteMarkdownAssets(
                context.questionNote ? context.questionNote.detailMarkdown : '',
                context.questionNote ? context.questionNote.imageRefs : [],
                assetMap,
                'obsidian',
                'obsidian/question/00_Question.md'
            );
            const lines = [];

            lines.push('---');
            lines.push('title: ' + this.yamlString(context.title));
            lines.push('zhihu_type: "question"');
            lines.push('zhihu_id: ' + this.yamlString(String(this.questionId || '')));
            lines.push('zhihu_url: ' + this.yamlString(context.sourceUrl));
            lines.push('zhihu_author: ""');
            lines.push('zhihu_author_token: ""');
            lines.push('zhihu_question: ' + this.yamlString(context.title));
            lines.push('created_at: ' + this.yamlString(this.normalizeTime(qInfo.created)));
            lines.push('updated_at: ' + this.yamlString(this.normalizeTime(qInfo.updated_time)));
            lines.push('vote_count: 0');
            lines.push('comment_count: ' + (qInfo.comment_count != null ? qInfo.comment_count : 0));
            lines.push('exported_at: ' + this.yamlString(exportedAtIso));
            lines.push('tags:');
            lines.push('  - zhihu/export');
            lines.push('  - zhihu/question');
            lines.push('---');
            lines.push('');
            lines.push('# ' + context.title);
            lines.push('');
            lines.push('> [!info] Question Overview');
            lines.push('> Source: [' + context.title + '](' + context.sourceUrl + ')');
            lines.push('> Exported: ' + exportedAtLabel);
            lines.push('> Answers: ' + context.items.length);
            lines.push('> Followers: ' + (qInfo.follower_count != null ? qInfo.follower_count : 0));
            lines.push('> Sort: ' + (context.sortBy === 'created' ? '按时间' : '按热度'));
            lines.push('');
            if (detailMarkdown) {
                lines.push('## 问题描述');
                lines.push('');
                lines.push(detailMarkdown);
                lines.push('');
            }
            lines.push('## 回答入口');
            lines.push('');
            context.items.forEach((item, index) => {
                lines.push((index + 1) + '. ' + this.obsidianWikiLink(item.obsidianRelPath, item.authorName + ' · 👍 ' + (item.voteCount || 0)));
            });
            lines.push('');
            return lines.join('\n');
        },

        renderObsidianItemNote: function(item, context, assetMap, exportedAtIso, exportedAtLabel) {
            const lines = [];
            const body = this.rewriteMarkdownAssets(item.markdownContent, item.imageRefs, assetMap, 'obsidian', 'obsidian/' + item.obsidianRelPath);

            lines.push('---');
            lines.push('title: ' + this.yamlString(item.title));
            lines.push('zhihu_type: ' + this.yamlString(item.type));
            lines.push('zhihu_id: ' + this.yamlString(item.id));
            lines.push('zhihu_url: ' + this.yamlString(item.sourceUrl));
            lines.push('zhihu_author: ' + this.yamlString(item.authorName));
            lines.push('zhihu_author_token: ' + this.yamlString(item.authorToken));
            lines.push('zhihu_question: ' + this.yamlString(item.questionTitle || ''));
            lines.push('created_at: ' + this.yamlString(item.createdAt));
            lines.push('updated_at: ' + this.yamlString(item.updatedAt));
            lines.push('vote_count: ' + (item.voteCount != null ? item.voteCount : 0));
            lines.push('comment_count: ' + (item.commentCount != null ? item.commentCount : 0));
            lines.push('exported_at: ' + this.yamlString(exportedAtIso));
            lines.push('tags:');
            lines.push('  - zhihu/export');
            lines.push('  - zhihu/' + item.type);
            if (context.kind === 'question') lines.push('  - zhihu/question-export');
            lines.push('---');
            lines.push('');
            lines.push('# ' + item.title);
            lines.push('');
            lines.push('> [!info] Source Info');
            lines.push('> Type: ' + TYPE_LABELS[item.type]);
            lines.push('> Source: ' + (item.sourceUrl ? '[' + item.sourceUrl + '](' + item.sourceUrl + ')' : 'N/A'));
            lines.push('> Author: ' + (item.authorToken ? '[' + item.authorName + '](https://www.zhihu.com/people/' + item.authorToken + ')' : item.authorName));
            if (item.authorHeadline) lines.push('> Headline: ' + item.authorHeadline);
            if (item.questionTitle) lines.push('> Question: ' + item.questionTitle);
            lines.push('> Created: ' + this.displayDate(item.createdAt));
            if (item.updatedAt) lines.push('> Updated: ' + this.displayDate(item.updatedAt));
            lines.push('> Votes: ' + (item.voteCount != null ? item.voteCount : 0) + ' · Comments: ' + (item.commentCount != null ? item.commentCount : 0));
            lines.push('> Exported: ' + exportedAtLabel);
            lines.push('');
            lines.push('## 正文');
            lines.push('');
            lines.push(body || '*（内容为空）*');
            lines.push('');
            return lines.join('\n');
        },

        renderNotebookOverview: function(context, exportedAtLabel) {
            const topItems = context.items.slice().sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0)).slice(0, 8);
            const lines = [];
            lines.push('# ' + context.title + ' · NotebookLM Overview');
            lines.push('');
            lines.push('Exported: ' + exportedAtLabel);
            lines.push('Source URL: ' + context.sourceUrl);
            lines.push('Export Mode: NotebookLM + Obsidian Zip');
            lines.push('Source Budget: keep content sources within ' + NOTEBOOKLM_MAX_CONTENT_SOURCES + ' files');
            lines.push('');

            if (context.kind === 'person') {
                lines.push('## Author Snapshot');
                lines.push('');
                lines.push('- Author: ' + context.authorName);
                if (context.authorHeadline) lines.push('- Headline: ' + context.authorHeadline);
                if (context.authorDescription) lines.push('- Description: ' + this.truncate(this.stripMarkdown(context.authorDescription), 240));
                lines.push('- Total Answers: ' + context.stats.answers);
                lines.push('- Total Articles: ' + context.stats.articles);
                lines.push('- Total Pins: ' + context.stats.pins);
                lines.push('');
            } else {
                lines.push('## Question Snapshot');
                lines.push('');
                lines.push('- Question: ' + context.title);
                lines.push('- Answers: ' + context.items.length);
                lines.push('- Sort: ' + (context.sortBy === 'created' ? '按时间' : '按热度'));
                if (context.includeDetail && context.questionNote && context.questionNote.detailMarkdown) {
                    lines.push('');
                    lines.push('## Question Detail');
                    lines.push('');
                    lines.push(this.truncate(this.stripMarkdown(context.questionNote.detailMarkdown), 1200));
                    lines.push('');
                }
            }

            lines.push('## Suggested Reading Order');
            lines.push('');
            topItems.forEach((item, index) => {
                lines.push((index + 1) + '. [' + TYPE_LABELS[item.type] + '] ' + item.title + ' · 👍 ' + (item.voteCount || 0));
            });
            lines.push('');
            lines.push('## How To Use In NotebookLM');
            lines.push('');
            lines.push('- Upload this `notebooklm/` folder into a notebook.');
            lines.push('- Start with `00_Overview.md` and `01_Study_Prompts.md`.');
            lines.push('- Continue with the `source-xx.md` files for grounded conversations.');
            lines.push('');
            return lines.join('\n');
        },

        renderNotebookPrompts: function(context) {
            const lines = [];
            lines.push('# Study Prompts');
            lines.push('');

            if (context.kind === 'person') {
                lines.push('1. 总结这个答主最稳定的核心观点，并按主题聚类。');
                lines.push('2. 找出高赞回答里的方法论，并给我一个可执行清单。');
                lines.push('3. 这位答主在哪些主题上观点发生过变化？请按时间线说明。');
                lines.push('4. 找出回答、文章、想法之间互相呼应的论点。');
                lines.push('5. 只基于这些材料，抽取适合写进 Obsidian 的 evergreen notes。');
                lines.push('6. 帮我对这些内容做反向提问，找出作者没展开但值得追问的部分。');
                lines.push('7. 把高赞内容提炼成适合复习的问答卡片。');
            } else {
                lines.push('1. 总结这个问题下最主要的观点阵营，并比较它们的证据强弱。');
                lines.push('2. 找出高赞回答中的共识与分歧。');
                lines.push('3. 按时间顺序梳理回答观点是否出现演化。');
                lines.push('4. 给我一份只基于这些回答的学习路径，从入门到深入。');
                lines.push('5. 对每类观点各举出最有代表性的回答，并说明理由。');
                lines.push('6. 生成适合 Obsidian 永久笔记的主题摘要。');
                lines.push('7. 挑出最值得继续外部求证的论断与假设。');
            }

            lines.push('');
            lines.push('## Prompt Pattern');
            lines.push('');
            lines.push('- 请严格引用 source 文件中的原文，不要臆测缺失信息。');
            lines.push('- 如果证据不足，请明确说明“不足以判断”。');
            lines.push('- 输出优先给我结构化结论、对比表和追问方向。');
            lines.push('');
            return lines.join('\n');
        },

        buildNotebookGroups: function(items) {
            if (!items.length) return [];

            const typeOrder = ['answer', 'article', 'pin'];
            const buckets = typeOrder
                .map((type) => ({
                    type,
                    items: items.filter((item) => item.type === type).sort((a, b) => this.compareByCreatedDesc(a, b))
                }))
                .filter((bucket) => bucket.items.length > 0);

            const maxGroups = Math.min(NOTEBOOKLM_MAX_CONTENT_SOURCES, items.length);
            const allocations = buckets.map((bucket) => ({ ...bucket, groupCount: 1 }));
            let remaining = Math.max(0, maxGroups - allocations.length);

            while (remaining > 0) {
                allocations.sort((a, b) => (b.items.length / b.groupCount) - (a.items.length / a.groupCount));
                allocations[0].groupCount += 1;
                remaining -= 1;
            }

            const groups = [];
            allocations.forEach((bucket) => {
                const chunks = this.chunkBalanced(bucket.items, bucket.groupCount);
                chunks.forEach((chunk) => {
                    if (chunk.length) {
                        groups.push({
                            type: bucket.type,
                            items: chunk
                        });
                    }
                });
            });

            return groups;
        },

        renderNotebookSource: function(context, group, assetMap, exportedAtIso, exportedAtLabel, index) {
            const lines = [];
            const start = group.items[group.items.length - 1];
            const end = group.items[0];

            lines.push('# Source ' + String(index).padStart(2, '0') + ' · ' + TYPE_LABELS[group.type]);
            lines.push('');
            lines.push('Exported: ' + exportedAtLabel);
            lines.push('Source URL: ' + context.sourceUrl);
            lines.push('Item Count: ' + group.items.length);
            lines.push('Type: ' + TYPE_LABELS[group.type]);
            lines.push('Time Window: ' + this.displayDate(start.createdAt) + ' ~ ' + this.displayDate(end.createdAt));
            lines.push('');

            group.items.forEach((item, itemIndex) => {
                lines.push('## Entry ' + String(itemIndex + 1).padStart(2, '0') + ' · ' + item.title);
                lines.push('');
                lines.push('- Zhihu Type: ' + TYPE_LABELS[item.type]);
                lines.push('- Zhihu ID: ' + item.id);
                lines.push('- Source URL: ' + (item.sourceUrl || ''));
                lines.push('- Author: ' + item.authorName);
                if (item.authorHeadline) lines.push('- Author Headline: ' + item.authorHeadline);
                if (item.questionTitle) lines.push('- Question: ' + item.questionTitle);
                lines.push('- Created: ' + this.displayDate(item.createdAt));
                lines.push('- Updated: ' + this.displayDate(item.updatedAt));
                lines.push('- Votes: ' + (item.voteCount != null ? item.voteCount : 0));
                lines.push('- Comments: ' + (item.commentCount != null ? item.commentCount : 0));
                lines.push('- Exported At: ' + exportedAtIso);
                lines.push('');
                lines.push('### Content');
                lines.push('');
                lines.push(this.rewriteMarkdownAssets(item.markdownContent, item.imageRefs, assetMap, 'notebooklm', ''));
                lines.push('');
            });

            return lines.join('\n');
        },

        buildManifest: function(rootName, context, obsidianFiles, notebookFiles, assetMap, exportedAtIso) {
            return {
                version: '4.0.0',
                exportMode: EXPORT_MODE_DUAL_ZIP,
                rootName: rootName,
                kind: context.kind,
                title: context.title,
                sourceUrl: context.sourceUrl,
                exportedAt: exportedAtIso,
                sourceBudget: {
                    maxSources: NOTEBOOKLM_MAX_SOURCES,
                    reserved: NOTEBOOKLM_RESERVED_SOURCES,
                    maxContentSources: NOTEBOOKLM_MAX_CONTENT_SOURCES,
                    generatedContentSources: Math.max(0, notebookFiles.length - NOTEBOOKLM_RESERVED_SOURCES)
                },
                stats: context.stats,
                files: {
                    obsidian: obsidianFiles.map((file) => 'obsidian/' + file.path),
                    notebooklm: notebookFiles.map((file) => 'notebooklm/' + file.path)
                },
                items: context.items.map((item) => ({
                    id: item.id,
                    type: item.type,
                    title: item.title,
                    sourceUrl: item.sourceUrl,
                    obsidianPath: 'obsidian/' + item.obsidianRelPath,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    voteCount: item.voteCount,
                    commentCount: item.commentCount,
                    imageCount: item.imageRefs.length
                })),
                images: Object.values(assetMap).map((asset) => ({
                    url: asset.url,
                    status: asset.status,
                    zipPath: asset.zipPath,
                    owners: asset.owners,
                    contentType: asset.contentType || '',
                    error: asset.error || ''
                }))
            };
        },

        // ==================== 答主页 Markdown 生成 ====================
        genPersonMarkdown: function(authorName, userInfo, answers, articles, pins) {
            const L = [];
            const now = new Date().toLocaleString('zh-CN');

            // Frontmatter
            if (CONFIG.addFrontmatter) {
                L.push('---');
                L.push('title: "' + this.ey(authorName) + ' - 知乎内容合集"');
                L.push('author: "' + this.ey(authorName) + '"');
                L.push('source: https://www.zhihu.com/people/' + this.urlToken);
                L.push('export_date: "' + now + '"');
                L.push('total_answers: ' + this.stats.answers);
                L.push('total_articles: ' + this.stats.articles);
                L.push('total_pins: ' + this.stats.pins);
                if (userInfo.headline) L.push('headline: "' + this.ey(userInfo.headline) + '"');
                L.push('tags:');
                L.push('  - 知乎导出');
                L.push('  - ' + authorName);
                L.push('---');
                L.push('');
            }

            L.push('# ' + authorName + ' · 知乎内容合集');
            L.push('');

            if (CONFIG.useCallout) {
                L.push('> [!info] 导出信息');
                L.push('> **作者主页**：[' + authorName + '](https://www.zhihu.com/people/' + this.urlToken + ')');
                if (userInfo.headline) L.push('> **个人简介**：' + userInfo.headline);
                L.push('> **导出时间**：' + now);
                L.push('> **内容统计**：回答 ' + this.stats.answers + ' 篇 · 文章 ' + this.stats.articles + ' 篇 · 想法 ' + this.stats.pins + ' 条');
            } else {
                L.push('> **作者**：[' + authorName + '](https://www.zhihu.com/people/' + this.urlToken + ')');
                if (userInfo.headline) L.push('> **简介**：' + userInfo.headline);
                L.push('> **导出时间**：' + now);
                L.push('> **统计**：回答 ' + this.stats.answers + ' · 文章 ' + this.stats.articles + ' · 想法 ' + this.stats.pins);
            }
            L.push('');
            L.push('---');
            L.push('');

            // ---- 目录 ----
            L.push('## 📑 目录');
            L.push('');

            if (answers.length > 0) {
                L.push('### 回答（' + answers.length + ' 篇）');
                L.push('');
                answers.forEach((a, i) => {
                    const t = this.ansTitle(a);
                    const h = this.mh('answer', i, t);
                    L.push(this.tocLink(i + 1, t, h));
                });
                L.push('');
            }
            if (articles.length > 0) {
                L.push('### 文章（' + articles.length + ' 篇）');
                L.push('');
                articles.forEach((a, i) => {
                    const t = a.title || '无标题';
                    const h = this.mh('article', i, t);
                    L.push(this.tocLink(i + 1, t, h));
                });
                L.push('');
            }
            if (pins.length > 0) {
                L.push('### 想法（' + pins.length + ' 条）');
                L.push('');
                pins.forEach((p, i) => {
                    const t = this.pinPreview(p);
                    const h = this.mh('pin', i, null);
                    L.push(this.tocLink(i + 1, t, h));
                });
                L.push('');
            }

            L.push('---');
            L.push('');

            // ---- 回答 ----
            if (answers.length > 0) {
                L.push('## 📝 回答');
                L.push('');
                answers.forEach((a, i) => {
                    const t = this.ansTitle(a);
                    L.push('### ' + this.mh('answer', i, t));
                    L.push('');
                    L.push(this.metaBlock(
                        a.created_time, a.updated_time,
                        a.voteup_count, a.comment_count,
                        this.ansUrl(a)
                    ));
                    L.push('');
                    L.push(this.html2md(a.content || '*（内容为空）*'));
                    L.push('');
                    L.push('---');
                    L.push('');
                });
            }

            // ---- 文章 ----
            if (articles.length > 0) {
                L.push('## 📄 文章');
                L.push('');
                articles.forEach((a, i) => {
                    const t = a.title || '无标题';
                    L.push('### ' + this.mh('article', i, t));
                    L.push('');
                    L.push(this.metaBlock(
                        a.created, a.updated,
                        a.voteup_count, a.comment_count,
                        this.artUrl(a)
                    ));
                    L.push('');
                    L.push(this.html2md(a.content || '*（内容为空）*'));
                    L.push('');
                    L.push('---');
                    L.push('');
                });
            }

            // ---- 想法 ----
            if (pins.length > 0) {
                L.push('## 💬 想法');
                L.push('');
                pins.forEach((p, i) => {
                    L.push('### ' + this.mh('pin', i, null));
                    L.push('');
                    const d = p.created ? new Date(p.created * 1000).toLocaleDateString('zh-CN') : '未知';
                    const likes = p.like_count || p.reaction_count || 0;
                    const comments = p.comment_count || 0;
                    if (CONFIG.useCallout) {
                        L.push('> [!note]- 元信息');
                        L.push('> 📅 ' + d + ' · ❤️ ' + likes + ' · 💬 ' + comments);
                    } else {
                        L.push('> 📅 ' + d + ' | ❤️ ' + likes + ' | 💬 ' + comments);
                    }
                    L.push('');
                    L.push(this.pinContent(p));
                    L.push('');
                    L.push('---');
                    L.push('');
                });
            }

            L.push('');
            L.push('> 本文档由知乎内容导出工具自动生成');
            return L.join('\n');
        },

        // ==================== 问题页 Markdown 生成 ====================
        genQuestionMarkdown: function(qInfo, answers, includeDetail, sortBy) {
            const L = [];
            const now = new Date().toLocaleString('zh-CN');
            const qTitle = qInfo.title || '未知问题';
            const qUrl = 'https://www.zhihu.com/question/' + this.questionId;
            const sortLabel = sortBy === 'created' ? '按时间' : '按热度';

            // Frontmatter
            if (CONFIG.addFrontmatter) {
                L.push('---');
                L.push('title: "' + this.ey(qTitle) + '"');
                L.push('source: ' + qUrl);
                L.push('export_date: "' + now + '"');
                L.push('answer_count: ' + answers.length);
                L.push('sort_by: ' + sortBy);
                L.push('tags:');
                L.push('  - 知乎导出');
                L.push('  - 知乎问题');
                L.push('---');
                L.push('');
            }

            // 标题
            L.push('# ' + qTitle);
            L.push('');

            // 问题信息
            if (CONFIG.useCallout) {
                L.push('> [!info] 问题信息');
                L.push('> **问题链接**：[' + qTitle + '](' + qUrl + ')');
                L.push('> **回答数量**：' + answers.length + ' 个');
                L.push('> **排序方式**：' + sortLabel);
                L.push('> **导出时间**：' + now);
                if (qInfo.follower_count) L.push('> **关注人数**：' + qInfo.follower_count);
            } else {
                L.push('> **问题链接**：[' + qTitle + '](' + qUrl + ')');
                L.push('> **回答数**：' + answers.length + ' | **排序**：' + sortLabel + ' | **导出时间**：' + now);
            }
            L.push('');

            // 问题描述
            if (includeDetail && qInfo.detail) {
                L.push('## 📃 问题描述');
                L.push('');
                L.push(this.html2md(qInfo.detail));
                L.push('');
            }

            L.push('---');
            L.push('');

            // ---- 目录 ----
            L.push('## 📑 目录（' + answers.length + ' 个回答）');
            L.push('');

            answers.forEach((a, i) => {
                const authorName = (a.author && a.author.name) ? a.author.name : '匿名用户';
                const votes = a.voteup_count != null ? a.voteup_count : 0;
                const heading = this.qHeading(i, authorName);
                const display = authorName + '（👍' + votes + '）';
                L.push(this.tocLink(i + 1, display, heading));
            });
            L.push('');
            L.push('---');
            L.push('');

            // ---- 回答正文 ----
            L.push('## 📝 全部回答');
            L.push('');

            answers.forEach((a, i) => {
                const authorName = (a.author && a.author.name) ? a.author.name : '匿名用户';
                const authorToken = (a.author && a.author.url_token) ? a.author.url_token : '';
                const authorHeadline = (a.author && a.author.headline) ? a.author.headline : '';
                const heading = this.qHeading(i, authorName);
                const date = a.created_time ? new Date(a.created_time * 1000).toLocaleDateString('zh-CN') : '未知';
                const updateDate = a.updated_time ? new Date(a.updated_time * 1000).toLocaleDateString('zh-CN') : null;
                const votes = a.voteup_count != null ? a.voteup_count : '-';
                const comments = a.comment_count != null ? a.comment_count : '-';
                const answerUrl = a.id
                    ? 'https://www.zhihu.com/question/' + this.questionId + '/answer/' + a.id
                    : '';
                const authorUrl = authorToken ? 'https://www.zhihu.com/people/' + authorToken : '';

                L.push('### ' + heading);
                L.push('');

                // 作者信息 + 元数据
                if (CONFIG.useCallout) {
                    L.push('> [!note]- 回答信息');
                    if (authorUrl) {
                        L.push('> **答主**：[' + authorName + '](' + authorUrl + ')');
                    } else {
                        L.push('> **答主**：' + authorName);
                    }
                    if (authorHeadline) L.push('> **简介**：' + authorHeadline);
                    L.push('> 📅 创建：' + date + (updateDate ? ' · 更新：' + updateDate : ''));
                    L.push('> 👍 赞同：' + votes + ' · 💬 评论：' + comments);
                    if (answerUrl) L.push('> 🔗 [查看原文](' + answerUrl + ')');
                } else {
                    let meta = '> ';
                    if (authorUrl) meta += '**[' + authorName + '](' + authorUrl + ')**';
                    else meta += '**' + authorName + '**';
                    if (authorHeadline) meta += ' · ' + authorHeadline;
                    L.push(meta);
                    let meta2 = '> 📅 ' + date;
                    if (updateDate) meta2 += '（更新: ' + updateDate + '）';
                    meta2 += ' | 👍 ' + votes + ' | 💬 ' + comments;
                    if (answerUrl) meta2 += ' | [原文](' + answerUrl + ')';
                    L.push(meta2);
                }
                L.push('');

                L.push(this.html2md(a.content || '*（内容为空）*'));
                L.push('');
                L.push('---');
                L.push('');
            });

            L.push('');
            L.push('> 本文档由知乎内容导出工具自动生成');
            return L.join('\n');
        },

        renderMarkdownAssetAsText: function(alt, url) {
            const label = alt && alt.trim() ? alt.trim() : '图片';
            return '[Image: ' + label + ']\nOriginal image: ' + url;
        },

        rewriteMarkdownAssets: function(markdown, imageRefs, assetMap, mode, notePath) {
            if (!markdown) return '';
            const refMap = new Map();
            imageRefs.forEach((ref) => {
                const normalizedUrl = this.normalizeAssetUrl(ref.url || '');
                if (normalizedUrl) refMap.set(normalizedUrl, ref);
            });

            return markdown.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, rawUrl) => {
                const normalizedUrl = this.normalizeAssetUrl(rawUrl);
                const ref = refMap.get(normalizedUrl);
                const asset = assetMap[normalizedUrl];
                if (mode === 'obsidian') {
                    if (asset && asset.status === 'ok' && asset.zipPath) {
                        const relativePath = this.relativePath(notePath, asset.zipPath);
                        return '![' + (alt || (ref && ref.alt) || '图片') + '](' + relativePath + ')';
                    }
                    return '![' + (alt || (ref && ref.alt) || '图片') + '](' + rawUrl + ')';
                }

                return this.renderMarkdownAssetAsText(alt || (ref && ref.alt) || '图片', normalizedUrl || rawUrl);
            });
        },

        requestBinary: function(url) {
            const gm = typeof GM_xmlhttpRequest === 'function'
                ? GM_xmlhttpRequest
                : (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest.bind(GM) : null);

            if (gm) {
                return new Promise((resolve, reject) => {
                    gm({
                        method: 'GET',
                        url: url,
                        responseType: 'arraybuffer',
                        onload: (response) => {
                            if (response.status >= 200 && response.status < 300) {
                                resolve({
                                    buffer: response.response,
                                    contentType: this.headerValue(response.responseHeaders || '', 'content-type')
                                });
                            } else {
                                reject(new Error('HTTP ' + response.status));
                            }
                        },
                        onerror: () => reject(new Error('Network error')),
                        ontimeout: () => reject(new Error('Request timeout'))
                    });
                });
            }

            return fetch(url).then(async (resp) => {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return {
                    buffer: await resp.arrayBuffer(),
                    contentType: resp.headers.get('content-type') || ''
                };
            });
        },

        runWithConcurrency: async function(items, limit, worker) {
            const concurrency = Math.max(1, Math.min(limit, items.length || 1));
            let cursor = 0;
            const workers = Array.from({ length: concurrency }, async () => {
                while (cursor < items.length) {
                    const index = cursor++;
                    await worker(items[index], index);
                }
            });
            await Promise.all(workers);
        },

        buildRootFolderName: function(context) {
            const label = context.kind === 'person'
                ? context.title + '_NotebookLM_Obsidian_Pack'
                : context.title + '_Question_Pack';
            const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            return this.sanitizeFileName(label).substring(0, 80) + '_' + stamp;
        },

        calcFetchProgress: function(processed, total) {
            if (!total || total <= 0) return '50';
            return Math.min((processed / total) * 95, 95).toFixed(1);
        },

        formatFetchCount: function(count, total) {
            const numericTotal = Number(total);
            if (!Number.isFinite(numericTotal) || numericTotal <= 0) return String(count);
            const label = count > numericTotal ? ('约 ' + numericTotal) : String(numericTotal);
            return count + ' / ' + label;
        },

        compareByCreatedDesc: function(a, b) {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tb - ta;
        },

        groupItemsByType: function(items) {
            return {
                answer: items.filter((item) => item.type === 'answer'),
                article: items.filter((item) => item.type === 'article'),
                pin: items.filter((item) => item.type === 'pin')
            };
        },

        chunkBalanced: function(items, groupCount) {
            const groups = [];
            let start = 0;

            for (let i = 0; i < groupCount; i++) {
                const remainingItems = items.length - start;
                const remainingGroups = groupCount - i;
                const size = Math.ceil(remainingItems / remainingGroups);
                groups.push(items.slice(start, start + size));
                start += size;
            }

            return groups.filter((group) => group.length > 0);
        },

        obsidianWikiLink: function(path, alias) {
            const target = path.replace(/\.md$/i, '');
            return '[[' + target + '|' + alias + ']]';
        },

        relativePath: function(fromFile, toFile) {
            const fromParts = fromFile.split('/').slice(0, -1);
            const toParts = toFile.split('/');
            while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
                fromParts.shift();
                toParts.shift();
            }
            return '../'.repeat(fromParts.length) + toParts.join('/');
        },

        generateImageBaseName: function(url) {
            return 'img-' + this.hashText(url);
        },

        resolveImageExtension: function(url, contentType) {
            if (contentType && IMAGE_EXTENSION_BY_TYPE[contentType.toLowerCase()]) {
                return IMAGE_EXTENSION_BY_TYPE[contentType.toLowerCase()];
            }
            const clean = (url || '').split('?')[0];
            const match = clean.match(/\.([a-zA-Z0-9]+)$/);
            if (match && match[1]) return match[1].toLowerCase();
            return 'jpg';
        },

        uniqueImageRefs: function(refs) {
            const seen = new Set();
            const result = [];
            refs.forEach((ref) => {
                const normalizedUrl = this.normalizeAssetUrl(ref.url || '');
                if (!normalizedUrl || seen.has(normalizedUrl)) return;
                seen.add(normalizedUrl);
                result.push({
                    url: normalizedUrl,
                    alt: ref.alt || '图片'
                });
            });
            return result;
        },

        extractImagesFromHtml: function(html) {
            if (!html) return [];
            const div = document.createElement('div');
            div.innerHTML = html;
            return Array.from(div.querySelectorAll('img')).map((img) => ({
                url: this.normalizeAssetUrl(
                    img.getAttribute('data-original')
                    || img.getAttribute('data-actualsrc')
                    || img.getAttribute('src')
                    || ''
                ),
                alt: img.getAttribute('alt') || '图片'
            })).filter((ref) => ref.url);
        },

        extractImagesFromPin: function(pin) {
            const refs = [];
            const walk = (target) => {
                if (!target) return;
                if (Array.isArray(target.content)) {
                    target.content.forEach((block) => {
                        if (block.type === 'image') {
                            refs.push({
                                url: this.normalizeAssetUrl(block.url || block.original_url || ''),
                                alt: block.title || '图片'
                            });
                        } else if (block.type === 'text' && block.content) {
                            refs.push(...this.extractImagesFromHtml(block.content));
                        }
                    });
                } else if (typeof target.content === 'string') {
                    refs.push(...this.extractImagesFromHtml(target.content));
                }
                if (target.origin_pin) walk(target.origin_pin);
            };
            walk(pin);
            return refs.filter((ref) => ref.url);
        },

        normalizeAssetUrl: function(url) {
            if (!url) return '';
            if (url.startsWith('//')) return 'https:' + url;
            return url;
        },

        normalizeTime: function(value) {
            if (!value) return '';
            let numeric = value;
            if (typeof numeric === 'string' && /^\d+$/.test(numeric)) numeric = Number(numeric);
            if (typeof numeric === 'number') {
                const ms = numeric < 1e12 ? numeric * 1000 : numeric;
                return new Date(ms).toISOString();
            }
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
        },

        displayDate: function(value) {
            if (!value) return '未知';
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN');
        },

        monthKey: function(value) {
            if (!value) return '未知时间';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '未知时间';
            return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0');
        },

        yamlString: function(value) {
            return '"' + String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        },

        sanitizeFileName: function(value) {
            return String(value || '')
                .replace(/[\\/:*?"<>|]/g, '_')
                .replace(/\s+/g, ' ')
                .trim();
        },

        truncate: function(text, maxLength) {
            const source = String(text || '').trim();
            if (source.length <= maxLength) return source;
            return source.substring(0, maxLength).trim() + '...';
        },

        stripMarkdown: function(text) {
            return String(text || '')
                .replace(/!\[.*?\]\(.*?\)/g, ' ')
                .replace(/\[(.*?)\]\(.*?\)/g, '$1')
                .replace(/[`*_>#-]/g, ' ')
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        },

        headerValue: function(headers, key) {
            const pattern = new RegExp('^' + key + ':\\s*(.+)$', 'im');
            const match = headers.match(pattern);
            return match ? match[1].trim() : '';
        },

        hashText: function(text) {
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                hash = ((hash << 5) - hash) + text.charCodeAt(i);
                hash |= 0;
            }
            return Math.abs(hash).toString(36);
        },

        delay: function(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        },

        decodePathToken: function(value) {
            try {
                return decodeURIComponent(value || '');
            } catch (error) {
                return value || '';
            }
        },

        numberOrZero: function(value) {
            const num = Number(value);
            return Number.isFinite(num) ? num : 0;
        },

        extractPeopleToken: function(url) {
            const match = String(url || '').match(/\/people\/([^/?#]+)/);
            return match ? this.decodePathToken(match[1]) : '';
        },

        // ==================== 标题/链接辅助 ====================

        /** 答主页内容标题 */
        mh: function(type, idx, title) {
            const n = idx + 1;
            if (type === 'answer') return '回答 ' + n + '：' + (title || '无标题');
            if (type === 'article') return '文章 ' + n + '：' + (title || '无标题');
            if (type === 'pin') return '想法 ' + n;
            return '条目 ' + n;
        },

        /** 问题页回答标题 */
        qHeading: function(idx, authorName) {
            return '回答 ' + (idx + 1) + ' · ' + authorName;
        },

        /** 目录链接 */
        tocLink: function(num, displayText, headingText) {
            if (CONFIG.linkStyle === 'obsidian') {
                return num + '. [[#' + headingText + '|' + displayText + ']]';
            } else {
                return num + '. [' + displayText + '](#' + this.slug(headingText) + ')';
            }
        },

        /** 标准 Markdown slug */
        slug: function(text) {
            return text
                .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
                .toLowerCase()
                .replace(/[^\p{L}\p{N}\s-]/gu, '')
                .trim()
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');
        },

        /** 元信息块 */
        metaBlock: function(createdTs, updatedTs, votes, comments, url) {
            const date = createdTs ? new Date(createdTs * 1000).toLocaleDateString('zh-CN') : '未知';
            const upd = updatedTs ? new Date(updatedTs * 1000).toLocaleDateString('zh-CN') : null;
            const v = votes != null ? votes : '-';
            const c = comments != null ? comments : '-';

            if (CONFIG.useCallout) {
                const lines = ['> [!note]- 元信息'];
                lines.push('> 📅 创建：' + date + (upd ? ' · 更新：' + upd : ''));
                lines.push('> 👍 赞同：' + v + ' · 💬 评论：' + c);
                if (url) lines.push('> 🔗 [查看原文](' + url + ')');
                return lines.join('\n');
            } else {
                let m = '> 📅 ' + date;
                if (upd) m += '（更新: ' + upd + '）';
                m += ' | 👍 ' + v + ' | 💬 ' + c;
                if (url) m += ' | [原文链接](' + url + ')';
                return m;
            }
        },

        // ==================== 数据提取 ====================

        ansTitle: function(a) {
            return (a.question && a.question.title) ? a.question.title : (a.title || '无标题');
        },

        ansUrl: function(a) {
            if (a.url) return a.url.startsWith('http') ? a.url : 'https://www.zhihu.com' + a.url;
            if (a.question && a.question.id && a.id) return 'https://www.zhihu.com/question/' + a.question.id + '/answer/' + a.id;
            if (a.id && this.questionId) return 'https://www.zhihu.com/question/' + this.questionId + '/answer/' + a.id;
            return '';
        },

        artUrl: function(a) {
            if (a.url) return a.url.startsWith('http') ? a.url : 'https://zhuanlan.zhihu.com' + a.url;
            if (a.id) return 'https://zhuanlan.zhihu.com/p/' + a.id;
            return '';
        },

        pinPreview: function(pin) {
            try {
                if (pin.content && Array.isArray(pin.content)) {
                    for (const b of pin.content) {
                        if (b.type === 'text') {
                            const t = (b.content || b.own_text || '').replace(/<[^>]*>/g, '').trim();
                            if (t) return t.length > 40 ? t.substring(0, 40) + '…' : t;
                        }
                    }
                }
                if (typeof pin.content === 'string') {
                    const t = pin.content.replace(/<[^>]*>/g, '').trim();
                    if (t) return t.length > 40 ? t.substring(0, 40) + '…' : t;
                }
            } catch (e) {}
            return '想法 #' + (pin.id || '');
        },

        pinContent: function(pin) {
            const parts = [];
            try {
                if (pin.content && Array.isArray(pin.content)) {
                    for (const b of pin.content) {
                        if (b.type === 'text') {
                            parts.push(this.html2md(b.content || b.own_text || ''));
                        } else if (b.type === 'image') {
                            const f = this.normalizeAssetUrl(b.url || b.original_url || '');
                            if (f) parts.push('![图片](' + f + ')');
                        } else if (b.type === 'video') {
                            parts.push('[视频](' + (b.url || '') + ')');
                        } else if (b.type === 'link') {
                            parts.push('[链接 ' + (b.title || '查看原文') + '](' + (b.url || '') + ')');
                        } else if (b.content) {
                            parts.push(String(b.content));
                        }
                    }
                } else if (typeof pin.content === 'string') {
                    parts.push(this.html2md(pin.content));
                }
                if (pin.origin_pin) {
                    const oAuthor = pin.origin_pin.author ? pin.origin_pin.author.name : '未知';
                    parts.push('');
                    if (CONFIG.useCallout) {
                        parts.push('> [!quote] 转发自 ' + oAuthor);
                    } else {
                        parts.push('> **转发自** ' + oAuthor + '：');
                        parts.push('> ');
                    }
                    const oc = this.pinContent(pin.origin_pin);
                    parts.push(oc.split('\n').map(l => '> ' + l).join('\n'));
                }
            } catch (e) {
                parts.push('*（想法内容解析失败）*');
            }
            return parts.join('\n\n');
        },

        // ==================== HTML → Markdown ====================
        html2md: function(html) {
            if (!html) return '';
            const div = document.createElement('div');
            div.innerHTML = html;
            const self = this;

            function kids(node) {
                return Array.from(node.childNodes).map(n => walk(n)).join('');
            }

            function walk(node) {
                if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
                if (node.nodeType !== Node.ELEMENT_NODE) return '';
                const tag = node.tagName.toLowerCase();

                if (tag === 'ol') {
                    return Array.from(node.children)
                        .filter(c => c.tagName && c.tagName.toLowerCase() === 'li')
                        .map((li, idx) => (idx + 1) + '. ' + kids(li).trim())
                        .join('\n') + '\n\n';
                }
                if (tag === 'ul') {
                    return Array.from(node.children)
                        .filter(c => c.tagName && c.tagName.toLowerCase() === 'li')
                        .map(li => '- ' + kids(li).trim())
                        .join('\n') + '\n\n';
                }
                if (tag === 'li') return '- ' + kids(node).trim() + '\n';

                const content = kids(node);

                switch (tag) {
                    case 'p': return content.trim() ? content.trim() + '\n\n' : '';
                    case 'br': return '\n';
                    case 'hr': return '\n---\n\n';
                    case 'img': {
                        const src = node.getAttribute('data-original') || node.getAttribute('data-actualsrc') || node.getAttribute('src') || '';
                        const full = self.normalizeAssetUrl(src);
                        const alt = node.getAttribute('alt') || '图片';
                        return full ? '![' + alt + '](' + full + ')\n\n' : '';
                    }
                    case 'b': case 'strong': return content.trim() ? '**' + content.trim() + '**' : '';
                    case 'i': case 'em': return content.trim() ? '*' + content.trim() + '*' : '';
                    case 'del': case 's': case 'strike': return content.trim() ? '~~' + content.trim() + '~~' : '';
                    case 'sup': return '<sup>' + content + '</sup>';
                    case 'sub': return '<sub>' + content + '</sub>';
                    case 'blockquote': return content.trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n';
                    case 'a': return '[' + content + '](' + self.cleanLink(node.getAttribute('href') || '') + ')';
                    case 'h1': return '#### ' + content.trim() + '\n\n';
                    case 'h2': return '##### ' + content.trim() + '\n\n';
                    case 'h3': case 'h4': case 'h5': case 'h6': return '###### ' + content.trim() + '\n\n';
                    case 'figure': return kids(node);
                    case 'figcaption': return content.trim() ? '*' + content.trim() + '*\n\n' : '';
                    case 'code':
                        return (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') ? content : '`' + content + '`';
                    case 'pre': {
                        const codeEl = node.querySelector('code');
                        const lang = codeEl ? (codeEl.className.match(/language-(\w+)/) || [])[1] || '' : '';
                        return '```' + lang + '\n' + content.trim() + '\n```\n\n';
                    }
                    case 'table': return self.convertTable(node) + '\n\n';
                    case 'video': {
                        const vs = node.getAttribute('src') || '';
                        return vs ? '[视频](' + vs + ')\n\n' : '';
                    }
                    case 'noscript': return '';
                    default: return content;
                }
            }

            return this.cleanMarkdownOutput(walk(div));
        },

        cleanMarkdownOutput: function(markdown) {
            return String(markdown || '')
                .replace(/^\*?"\s*data-size=.*\*?$/gm, '')
                .replace(/(\]\([^)]+\))(#{4,6}\s)/g, '$1\n\n$2')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        },

        convertTable: function(tbl) {
            const rows = Array.from(tbl.querySelectorAll('tr'));
            if (!rows.length) return '';
            const result = [];
            rows.forEach((row, ri) => {
                const cells = Array.from(row.querySelectorAll('td, th'));
                const texts = cells.map(c => c.textContent.trim().replace(/\|/g, '\\|').replace(/\n/g, ' '));
                result.push('| ' + texts.join(' | ') + ' |');
                if (ri === 0) result.push('| ' + texts.map(() => '---').join(' | ') + ' |');
            });
            return result.join('\n');
        },

        cleanLink: function(href) {
            if (!href) return '';
            try {
                if (href.includes('link.zhihu.com') && href.includes('target=')) {
                    const u = new URL(href);
                    const t = u.searchParams.get('target');
                    if (t) return decodeURIComponent(t);
                }
            } catch (e) {}
            return href;
        },

        // ==================== 工具 ====================
        ey: function(s) { return s ? s.replace(/"/g, '\\"').replace(/\n/g, ' ') : ''; },

        downloadTextFile: function(content, fileName) {
            const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
            this.downloadBlob(blob, fileName);
        },

        downloadBlob: function(blob, fileName) {
            const safeName = this.sanitizeFileName(fileName).substring(0, 140);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = safeName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        },

        downloadFile: function(content, title) {
            this.downloadTextFile(content, title + '.md');
        }
    };

    // ==================== 启动 ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ZhihuExporter.init());
    } else {
        ZhihuExporter.init();
    }
})();
