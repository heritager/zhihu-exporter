// ==UserScript==
// @name         知乎内容导出（Obsidian优化版）
// @namespace    https://github.com/zhihu-exporter
// @version      3.0.0
// @description  支持导出答主全部内容 + 问题下所有回答，生成Obsidian友好的Markdown文档
// @author       ZhihuExporter
// @license      MIT
// @match        https://www.zhihu.com/people/*
// @match        https://www.zhihu.com/question/*
// @icon         https://static.zhihu.com/heifetz/favicon.ico
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ======================== 全局配置 ========================
    const CONFIG = {
        linkStyle: 'obsidian',     // 'obsidian' | 'standard'
        addFrontmatter: true,
        useCallout: true,
        requestDelay: 350
    };

    // ======================== 主对象 ========================
    const ZhihuExporter = {

        // ---- 状态 ----
        mode: null,          // 'person' | 'question'
        urlToken: null,      // 答主 url_token
        questionId: null,    // 问题 id
        ui: {},
        aborted: false,
        stats: { answers: 0, articles: 0, pins: 0 },

        // ==================== 初始化 ====================
        init: function() {
            const personMatch = location.pathname.match(/\/people\/([^\/]+)/);
            const questionMatch = location.pathname.match(/\/question\/(\d+)/);

            if (personMatch) {
                this.mode = 'person';
                this.urlToken = personMatch[1];
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
                position: 'fixed', top: '70px', right: '20px', zIndex: '10000',
                width: '340px', backgroundColor: '#fff', borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                overflow: 'hidden', border: '1px solid #e8e8e8'
            });

            // ---- 头部 ----
            const header = document.createElement('div');
            const gradientColor = this.mode === 'question'
                ? 'linear-gradient(135deg, #7B2FF7 0%, #9B59B6 100%)'
                : 'linear-gradient(135deg, #0066FF 0%, #1a8cff 100%)';
            Object.assign(header.style, {
                background: gradientColor,
                padding: '16px 20px', color: 'white', position: 'relative'
            });

            if (this.mode === 'person') {
                header.innerHTML =
                    '<div style="font-size:16px;font-weight:600;">📦 答主内容导出</div>' +
                    '<div style="font-size:12px;opacity:0.85;margin-top:4px;">导出该答主的全部内容为 Markdown</div>';
            } else {
                header.innerHTML =
                    '<div style="font-size:16px;font-weight:600;">📋 问题回答导出</div>' +
                    '<div style="font-size:12px;opacity:0.85;margin-top:4px;">导出该问题下所有回答为 Markdown</div>';
            }

            // 关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            Object.assign(closeBtn.style, {
                position: 'absolute', top: '12px', right: '12px', background: 'rgba(255,255,255,0.3)',
                border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer',
                width: '24px', height: '24px', borderRadius: '50%', lineHeight: '22px',
                textAlign: 'center', padding: '0'
            });
            header.appendChild(closeBtn);
            panel.appendChild(header);

            // ---- 选项区 ----
            const optionsDiv = document.createElement('div');
            Object.assign(optionsDiv.style, { padding: '16px 20px', borderBottom: '1px solid #f0f0f0' });

            if (this.mode === 'person') {
                // 答主页：选择导出类型
                const createCheckbox = (id, label, checked) => {
                    const wrapper = document.createElement('label');
                    Object.assign(wrapper.style, {
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '6px 0', cursor: 'pointer', fontSize: '14px', color: '#333'
                    });
                    const cb = document.createElement('input');
                    cb.type = 'checkbox'; cb.id = id; cb.checked = checked;
                    Object.assign(cb.style, { width: '16px', height: '16px', accentColor: '#0066FF' });
                    const span = document.createElement('span');
                    span.textContent = label;
                    wrapper.appendChild(cb); wrapper.appendChild(span);
                    return wrapper;
                };
                optionsDiv.appendChild(createCheckbox('exp-answers', '📝 导出回答', true));
                optionsDiv.appendChild(createCheckbox('exp-articles', '📄 导出文章', true));
                optionsDiv.appendChild(createCheckbox('exp-pins', '💬 导出想法', true));
            } else {
                // 问题页：排序选项
                const sortLabel = document.createElement('div');
                sortLabel.textContent = '回答排序方式';
                Object.assign(sortLabel.style, { fontSize: '13px', color: '#666', marginBottom: '10px' });
                optionsDiv.appendChild(sortLabel);

                const createRadio = (value, label, checked) => {
                    const wrapper = document.createElement('label');
                    Object.assign(wrapper.style, {
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 0', cursor: 'pointer', fontSize: '14px', color: '#333'
                    });
                    const rb = document.createElement('input');
                    rb.type = 'radio'; rb.name = 'q-sort'; rb.value = value; rb.checked = checked;
                    Object.assign(rb.style, { accentColor: '#7B2FF7' });
                    const span = document.createElement('span');
                    span.textContent = label;
                    wrapper.appendChild(rb); wrapper.appendChild(span);
                    return wrapper;
                };
                optionsDiv.appendChild(createRadio('default', '🔥 默认排序（按热度）', true));
                optionsDiv.appendChild(createRadio('created', '🕐 按时间排序', false));

                // 包含问题描述
                const descWrapper = document.createElement('label');
                Object.assign(descWrapper.style, {
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 0 2px', cursor: 'pointer', fontSize: '14px', color: '#333',
                    borderTop: '1px solid #f0f0f0', marginTop: '8px'
                });
                const descCb = document.createElement('input');
                descCb.type = 'checkbox'; descCb.id = 'exp-q-detail'; descCb.checked = true;
                Object.assign(descCb.style, { width: '16px', height: '16px', accentColor: '#7B2FF7' });
                const descSpan = document.createElement('span');
                descSpan.textContent = '📃 包含问题描述';
                descWrapper.appendChild(descCb); descWrapper.appendChild(descSpan);
                optionsDiv.appendChild(descWrapper);
            }
            panel.appendChild(optionsDiv);

            // ---- 链接风格 ----
            const linkDiv = document.createElement('div');
            Object.assign(linkDiv.style, { padding: '12px 20px', borderBottom: '1px solid #f0f0f0' });
            const linkLabel = document.createElement('div');
            linkLabel.textContent = '链接风格';
            Object.assign(linkLabel.style, { fontSize: '13px', color: '#666', marginBottom: '8px' });
            linkDiv.appendChild(linkLabel);

            const createLinkRadio = (value, label, checked) => {
                const wrapper = document.createElement('label');
                Object.assign(wrapper.style, {
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    marginRight: '16px', cursor: 'pointer', fontSize: '13px', color: '#333'
                });
                const rb = document.createElement('input');
                rb.type = 'radio'; rb.name = 'link-style'; rb.value = value; rb.checked = checked;
                const span = document.createElement('span');
                span.textContent = label;
                wrapper.appendChild(rb); wrapper.appendChild(span);
                return wrapper;
            };
            linkDiv.appendChild(createLinkRadio('obsidian', 'Obsidian', true));
            linkDiv.appendChild(createLinkRadio('standard', '通用 Markdown', false));
            panel.appendChild(linkDiv);

            // ---- 进度区 ----
            const progressDiv = document.createElement('div');
            Object.assign(progressDiv.style, { padding: '12px 20px', display: 'none' });

            const progressBarBg = document.createElement('div');
            Object.assign(progressBarBg.style, {
                width: '100%', height: '8px', backgroundColor: '#f0f0f0',
                borderRadius: '4px', overflow: 'hidden'
            });
            const progressBar = document.createElement('div');
            Object.assign(progressBar.style, {
                width: '0%', height: '100%',
                background: this.mode === 'question'
                    ? 'linear-gradient(90deg, #7B2FF7, #9B59B6)'
                    : 'linear-gradient(90deg, #0066FF, #1a8cff)',
                borderRadius: '4px', transition: 'width 0.3s ease'
            });
            progressBarBg.appendChild(progressBar);
            progressDiv.appendChild(progressBarBg);

            const progressText = document.createElement('div');
            Object.assign(progressText.style, { fontSize: '12px', color: '#666', marginTop: '8px', textAlign: 'center' });
            progressText.textContent = '准备中...';
            progressDiv.appendChild(progressText);

            const stageText = document.createElement('div');
            Object.assign(stageText.style, { fontSize: '11px', color: '#999', marginTop: '4px', textAlign: 'center' });
            progressDiv.appendChild(stageText);
            panel.appendChild(progressDiv);

            // ---- 按钮区 ----
            const btnDiv = document.createElement('div');
            Object.assign(btnDiv.style, { padding: '12px 20px 16px' });

            const btnColor = this.mode === 'question' ? '#7B2FF7' : '#0066FF';
            const btnHover = this.mode === 'question' ? '#6622cc' : '#0052cc';

            const exportBtn = document.createElement('button');
            exportBtn.textContent = '🚀 开始导出';
            Object.assign(exportBtn.style, {
                width: '100%', padding: '10px', backgroundColor: btnColor, color: '#fff',
                border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
                cursor: 'pointer', transition: 'all 0.2s'
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
                width: '100%', padding: '8px', backgroundColor: 'transparent', color: '#999',
                border: '1px solid #e8e8e8', borderRadius: '8px', fontSize: '13px',
                cursor: 'pointer', marginTop: '8px', display: 'none'
            });
            cancelBtn.onclick = () => { this.aborted = true; };
            btnDiv.appendChild(cancelBtn);
            panel.appendChild(btnDiv);

            // ---- 折叠按钮 ----
            const toggleBtn = document.createElement('button');
            toggleBtn.textContent = this.mode === 'question' ? '📋' : '📦';
            Object.assign(toggleBtn.style, {
                position: 'fixed', top: '70px', right: '20px', zIndex: '10001',
                width: '40px', height: '40px', borderRadius: '50%',
                backgroundColor: btnColor, color: 'white', border: 'none',
                fontSize: '18px', cursor: 'pointer', display: 'none',
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

            document.body.appendChild(panel);
            this.ui = { panel, progressDiv, progressBar, progressText, stageText, exportBtn, cancelBtn, toggleBtn };
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

        // ==================== 答主页导出 ====================
        startPersonExport: async function() {
            this.aborted = false;
            this.stats = { answers: 0, articles: 0, pins: 0 };

            const expAnswers = document.getElementById('exp-answers').checked;
            const expArticles = document.getElementById('exp-articles').checked;
            const expPins = document.getElementById('exp-pins').checked;
            CONFIG.linkStyle = (document.querySelector('input[name="link-style"]:checked') || {}).value || 'obsidian';

            if (!expAnswers && !expArticles && !expPins) {
                alert('请至少选择一种内容类型！'); return;
            }

            this.lockUI();
            this.setProgress(0, '正在获取用户信息...', '');

            try {
                const userResp = await fetch(
                    '/api/v4/members/' + this.urlToken +
                    '?include=' + encodeURIComponent('answer_count,articles_count,pins_count,name,headline,description,follower_count')
                );
                if (!userResp.ok) throw new Error('获取用户信息失败: ' + userResp.status);
                const userInfo = await userResp.json();
                const authorName = userInfo.name || this.urlToken;

                const totalTasks =
                    (expAnswers ? (userInfo.answer_count || 0) : 0) +
                    (expArticles ? (userInfo.articles_count || 0) : 0) +
                    (expPins ? (userInfo.pins_count || 0) : 0);
                let processed = 0;

                const allAnswers = [], allArticles = [], allPins = [];

                // ---- 回答 ----
                if (expAnswers && !this.aborted) {
                    const total = userInfo.answer_count || '?';
                    this.setProgress(0, '正在导出回答...', '0 / ' + total);
                    const items = await this.fetchAllPaged(
                        '/api/v4/members/' + this.urlToken + '/answers',
                        { include: 'data[*].content,voteup_count,created_time,updated_time,comment_count,question.title', limit: 20, sort_by: 'created' },
                        (c) => { processed++; this.setProgress(Math.min(processed/totalTasks*100,100).toFixed(1), '正在导出回答...', c+' / '+total); }
                    );
                    allAnswers.push(...items);
                    this.stats.answers = allAnswers.length;
                }

                // ---- 文章 ----
                if (expArticles && !this.aborted) {
                    const total = userInfo.articles_count || '?';
                    this.setProgress((processed/totalTasks*100).toFixed(1), '正在导出文章...', '0 / '+total);
                    const items = await this.fetchAllPaged(
                        '/api/v4/members/' + this.urlToken + '/articles',
                        { include: 'data[*].content,voteup_count,created,updated,comment_count,title', limit: 20, sort_by: 'created' },
                        (c) => { processed++; this.setProgress(Math.min(processed/totalTasks*100,100).toFixed(1), '正在导出文章...', c+' / '+total); }
                    );
                    allArticles.push(...items);
                    this.stats.articles = allArticles.length;
                }

                // ---- 想法 ----
                if (expPins && !this.aborted) {
                    const total = userInfo.pins_count || '?';
                    this.setProgress((processed/totalTasks*100).toFixed(1), '正在导出想法...', '0 / '+total);
                    const items = await this.fetchAllPaged(
                        '/api/v4/members/' + this.urlToken + '/pins',
                        { limit: 20 },
                        (c) => { processed++; this.setProgress(Math.min(processed/totalTasks*100,100).toFixed(1), '正在导出想法...', c+' / '+total); }
                    );
                    allPins.push(...items);
                    this.stats.pins = allPins.length;
                }

                if (this.aborted) { this.setProgress(0, '导出已取消', ''); this.resetUI(2000); return; }

                this.setProgress(98, '正在生成 Markdown...', '');
                const md = this.genPersonMarkdown(authorName, userInfo, allAnswers, allArticles, allPins);
                this.downloadFile(md, authorName + '_内容合集');

                this.setProgress(100, '✅ 导出完成！',
                    '回答: '+this.stats.answers+' | 文章: '+this.stats.articles+' | 想法: '+this.stats.pins);

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

            const sortEl = document.querySelector('input[name="q-sort"]:checked');
            const sortBy = sortEl ? sortEl.value : 'default';
            const includeDetail = document.getElementById('exp-q-detail') ? document.getElementById('exp-q-detail').checked : true;
            CONFIG.linkStyle = (document.querySelector('input[name="link-style"]:checked') || {}).value || 'obsidian';

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

                this.setProgress(96, '正在生成 Markdown...', '');
                const md = this.genQuestionMarkdown(qInfo, allAnswers, includeDetail, sortBy);
                this.downloadFile(md, qTitle + '_' + allAnswers.length + '个回答');

                this.setProgress(100, '✅ 导出完成！', '共 ' + allAnswers.length + ' 个回答');

            } catch (err) {
                console.error('导出失败:', err);
                this.setProgress(0, '❌ 导出失败: ' + err.message, '');
            } finally {
                this.resetUI(5000);
            }
        },

        // ==================== API 分页请求 ====================
        fetchAllPaged: async function(baseUrl, params, onItem) {
            const allItems = [];
            let offset = 0;
            const limit = params.limit || 20;
            let count = 0;

            while (true) {
                if (this.aborted) break;

                const urlParams = new URLSearchParams({ ...params, offset: String(offset), limit: String(limit) });
                const resp = await fetch(baseUrl + '?' + urlParams.toString());

                if (!resp.ok) {
                    if (resp.status === 429) {
                        console.warn('限流，等待 3 秒...');
                        await new Promise(r => setTimeout(r, 3000));
                        continue;
                    }
                    console.warn('请求失败 offset=' + offset + ' status=' + resp.status);
                    break;
                }

                const data = await resp.json();
                if (!data.data || data.data.length === 0) break;

                for (const item of data.data) {
                    allItems.push(item);
                    count++;
                    if (onItem) onItem(count);
                }

                if (data.paging && data.paging.is_end) break;
                offset += limit;
                await new Promise(r => setTimeout(r, CONFIG.requestDelay));
            }
            return allItems;
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
                            const u = b.url || b.original_url || '';
                            const f = u.startsWith('//') ? 'https:' + u : u;
                            if (f) parts.push('![图片](' + f + ')');
                        } else if (b.type === 'video') {
                            parts.push('[🎬 视频](' + (b.url || '') + ')');
                        } else if (b.type === 'link') {
                            parts.push('[🔗 ' + (b.title || '链接') + '](' + (b.url || '') + ')');
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
                        const full = src.startsWith('//') ? 'https:' + src : src;
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
                        return vs ? '[🎬 视频](' + vs + ')\n\n' : '';
                    }
                    case 'noscript': return '';
                    default: return content;
                }
            }

            return walk(div).trim().replace(/\n{3,}/g, '\n\n');
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

        downloadFile: function(content, title) {
            const safe = title.replace(/[\\\/:*?"<>|]/g, '_').substring(0, 100);
            const fileName = safe + '.md';
            const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
    };

    // ==================== 启动 ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ZhihuExporter.init());
    } else {
        ZhihuExporter.init();
    }
})();