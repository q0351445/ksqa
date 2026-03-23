/**
 * 运维知识库 - 前端逻辑 v3.1
 * 功能：自动加载首页、后台全量搜索、实时进度、图片显示
 */

const CONFIG = {
    indexUrl: 'data/index.json',
    chunkSize: 500,
    pageSize: 20
};

const state = {
    indexData: null,
    chunks: {},           // 已加载的分片数据
    loadedChunks: new Set(),
    currentPage: 1,
    totalPages: 0,
    keyword: '',
    sourceFilter: '',
    viewMode: 'table',
    displayMode: 'compact',
    isMobile: window.innerWidth <= 768,
    searchResults: null   // 搜索结果缓存
};

const dom = {};

// ==================== 初始化 ====================
async function init() {
    cacheDom();
    
    if (state.isMobile) {
        state.viewMode = 'card';
    }
    
    showStatus('正在加载...');
    
    try {
        await loadIndex();
        
        // 自动加载第一个分片并显示首页
        await loadChunk(0);
        showPage(1);
        
        // 后台预加载更多分片
        preloadChunks();
        
        updateStats();
        bindEvents();
        hideStatus();
        
    } catch (err) {
        showError('数据加载失败：' + err.message);
        console.error(err);
    }
}

function cacheDom() {
    dom.totalCount = document.getElementById('totalCount');
    dom.updateTime = document.getElementById('updateTime');
    dom.resultCount = document.getElementById('resultCount');
    dom.qaList = document.getElementById('qaList');
    dom.pagination = document.getElementById('pagination');
    dom.loading = document.getElementById('loading');
    dom.error = document.getElementById('error');
    dom.searchInput = document.getElementById('searchInput');
    dom.sourceFilter = document.getElementById('sourceFilter');
    dom.viewToggle = document.querySelectorAll('.view-toggle button');
    dom.displayToggle = document.querySelectorAll('.display-toggle button');
}

// ==================== 数据加载 ====================
async function loadIndex() {
    const res = await fetch(CONFIG.indexUrl);
    if (!res.ok) throw new Error('索引加载失败');
    state.indexData = await res.json();
}

async function loadChunk(index) {
    if (state.loadedChunks.has(index)) return;
    if (!state.indexData.chunks[index]) return;
    
    const chunkFile = state.indexData.chunks[index];
    const res = await fetch('data/chunks/' + chunkFile);
    if (!res.ok) throw new Error(`分片${index}加载失败`);
    
    const data = await res.json();
    state.chunks[index] = data.data || [];
    state.loadedChunks.add(index);
    
    // 更新加载进度显示
    updateLoadProgress();
}

async function preloadChunks() {
    for (let i = 1; i < Math.min(5, state.indexData.chunk_count); i++) {
        if (!state.loadedChunks.has(i)) {
            loadChunk(i).catch(() => {});
        }
    }
}

function updateLoadProgress() {
    const loaded = state.loadedChunks.size;
    const total = state.indexData.chunk_count;
    const loadedRecords = loaded * CONFIG.chunkSize;
    const totalRecords = state.indexData.total_count;
    
    dom.totalCount.innerHTML = `共 <strong>${totalRecords}</strong> 条 | 已加载 <strong>${loadedRecords}</strong> 条`;
}

// ==================== 数据获取 ====================
function getAllLoadedData() {
    let all = [];
    for (let i = 0; i < state.indexData.chunk_count; i++) {
        if (state.chunks[i]) {
            all = all.concat(state.chunks[i]);
        }
    }
    return all;
}

async function ensureAllDataLoaded() {
    const toLoad = [];
    for (let i = 0; i < state.indexData.chunk_count; i++) {
        if (!state.loadedChunks.has(i)) {
            toLoad.push(i);
        }
    }
    
    if (toLoad.length === 0) return;
    
    // 显示加载进度
    for (let i = 0; i < toLoad.length; i++) {
        showStatus(`正在加载数据... ${state.loadedChunks.size}/${state.indexData.chunk_count}`);
        await loadChunk(toLoad[i]);
    }
    hideStatus();
}

// ==================== 渲染 ====================
function updateStats() {
    dom.updateTime.textContent = formatTime(state.indexData.update_time);
    
    // 更新来源筛选
    const sources = [...new Set(getAllLoadedData().map(d => d.source))];
    dom.sourceFilter.innerHTML = '<option value="">全部来源</option>' +
        sources.map(s => `<option value="${s}">${s}</option>`).join('');
}

function showPage(page) {
    const start = (page - 1) * CONFIG.pageSize;
    const end = start + CONFIG.pageSize;
    
    // 确定数据源
    let dataSource;
    if (state.searchResults !== null) {
        dataSource = state.searchResults;
        dom.resultCount.textContent = `找到 ${state.searchResults.length} 条结果`;
    } else {
        dataSource = getAllLoadedData();
        dom.resultCount.textContent = `已加载 ${dataSource.length}/${state.indexData.total_count} 条`;
    }
    
    state.totalPages = Math.ceil(dataSource.length / CONFIG.pageSize);
    state.currentPage = Math.max(1, Math.min(page, state.totalPages));
    
    const pageData = dataSource.slice(start, end);
    
    if (pageData.length === 0) {
        renderEmpty();
    } else if (state.viewMode === 'table' && !state.isMobile) {
        renderTable(pageData, start);
    } else {
        renderCards(pageData, start);
    }
    
    renderPagination();
}

function renderEmpty() {
    dom.qaList.className = 'qa-list cards';
    dom.qaList.innerHTML = `
        <div class="empty-state">
            <div class="icon">📭</div>
            <p>${state.keyword ? '未找到相关记录' : '暂无数据'}</p>
        </div>
    `;
}

function renderTable(data, start) {
    dom.qaList.className = 'qa-list table-view';
    
    let html = `<div class="table-header">
        <span>序号</span>
        <span>问题描述</span>
        <span>解决方法</span>
        <span>操作</span>
    </div>`;
    
    data.forEach((item, i) => {
        const num = start + i + 1;
        const problem = truncate(stripImages(item.problem), 60);
        const solution = truncate(stripImages(item.solution), 60);
        
        html += `<div class="table-row" onclick="showDetail(${start + i})">
            <span class="num">${num}</span>
            <span class="content">${highlight(escapeHtml(problem))}</span>
            <span class="content">${highlight(escapeHtml(solution))}</span>
            <span class="action">详情</span>
        </div>`;
    });
    
    dom.qaList.innerHTML = html;
}

function renderCards(data, start) {
    dom.qaList.className = 'qa-list cards';
    
    let html = '';
    data.forEach((item, i) => {
        const num = start + i + 1;
        const preview = truncate(stripImages(item.problem || item.solution), 50);
        
        html += `<div class="qa-item card" onclick="showDetail(${start + i})">
            <div class="qa-header">
                <span class="qa-number">#${num}</span>
                <span class="source-tag">${escapeHtml(item.source)}</span>
            </div>
            <div class="qa-preview">${highlight(escapeHtml(preview))}</div>
        </div>`;
    });
    
    dom.qaList.innerHTML = html;
}

function renderPagination() {
    if (state.totalPages <= 1) {
        dom.pagination.innerHTML = '';
        return;
    }
    
    let html = `<button ${state.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${state.currentPage - 1})">‹</button>`;
    
    for (let i = 1; i <= Math.min(5, state.totalPages); i++) {
        const p = state.currentPage <= 3 ? i : state.currentPage - 3 + i;
        if (p > state.totalPages) break;
        html += `<button class="${p === state.currentPage ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
    }
    
    html += `<button ${state.currentPage === state.totalPages ? 'disabled' : ''} onclick="goToPage(${state.currentPage + 1})">›</button>`;
    dom.pagination.innerHTML = html;
}

// ==================== 详情弹窗 ====================
function showDetail(index) {
    const dataSource = state.searchResults !== null ? state.searchResults : getAllLoadedData();
    const item = dataSource[index];
    if (!item) return;
    
    // 关闭已有弹窗
    document.querySelector('.modal-overlay')?.remove();
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>#${index + 1} - ${escapeHtml(item.source)}</h3>
                <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="detail-section problem">
                    <div class="section-label">问题描述</div>
                    <div class="section-content">${renderContent(item.problem)}</div>
                </div>
                <div class="detail-section solution">
                    <div class="section-label">解决方法</div>
                    <div class="section-content">${renderContent(item.solution)}</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escHandler);
        }
    });
}

function renderContent(text) {
    if (!text) return '<span class="no-content">无</span>';
    
    let html = escapeHtml(text);
    
    // 图片：将 Markdown 格式转为 img 标签
    html = html.replace(/!\[图片\]\(([^)]+)\)/g, (match, url) => {
        return `<img src="${url}" alt="图片" class="qa-image" onclick="showImage(this)" loading="lazy" onerror="this.onerror=null;this.src='';this.outerHTML='<span class=\\'img-error\\'>[图片加载失败]</span>'">`;
    });
    
    // 关键词高亮
    if (state.keyword) {
        const re = new RegExp(`(${escapeRegex(state.keyword)})`, 'gi');
        html = html.replace(re, '<span class="highlight">$1</span>');
    }
    
    return html;
}

function showImage(img) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.onclick = () => modal.remove();
    modal.innerHTML = `
        <div class="image-modal-content">
            <img src="${img.src}">
            <span class="image-modal-close" onclick="this.parentElement.parentElement.remove()">×</span>
        </div>
    `;
    document.body.appendChild(modal);
}

// ==================== 搜索 ====================
async function doSearch() {
    state.keyword = dom.searchInput.value.trim();
    state.currentPage = 1;
    
    if (state.keyword) {
        // 加载全部数据
        await ensureAllDataLoaded();
        
        const kw = state.keyword.toLowerCase();
        const all = getAllLoadedData();
        state.searchResults = all.filter(item =>
            (item.problem && item.problem.toLowerCase().includes(kw)) ||
            (item.solution && item.solution.toLowerCase().includes(kw))
        );
        
        if (state.sourceFilter) {
            state.searchResults = state.searchResults.filter(item => item.source === state.sourceFilter);
        }
    } else {
        state.searchResults = null;
    }
    
    showPage(1);
}

// ==================== 事件绑定 ====================
function bindEvents() {
    // 搜索
    document.getElementById('searchBtn').onclick = doSearch;
    dom.searchInput.onkeypress = e => { if (e.key === 'Enter') doSearch(); };
    
    // 重置
    document.getElementById('clearBtn').onclick = () => {
        dom.searchInput.value = '';
        dom.sourceFilter.value = '';
        state.keyword = '';
        state.sourceFilter = '';
        state.searchResults = null;
        showPage(1);
    };
    
    // 来源筛选
    dom.sourceFilter.onchange = () => {
        state.sourceFilter = dom.sourceFilter.value;
        if (state.keyword) {
            doSearch();
        }
    };
    
    // 视图切换
    dom.viewToggle.forEach(btn => {
        btn.onclick = () => {
            if (state.isMobile) return;
            state.viewMode = btn.dataset.view;
            dom.viewToggle.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            showPage(state.currentPage);
        };
    });
    
    // 展示模式切换
    dom.displayToggle.forEach(btn => {
        btn.onclick = () => {
            state.displayMode = btn.dataset.display;
            dom.displayToggle.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            showPage(state.currentPage);
        };
    });
    
    // 响应式
    window.onresize = () => {
        state.isMobile = window.innerWidth <= 768;
        if (state.isMobile) state.viewMode = 'card';
        showPage(state.currentPage);
    };
    
    updateToggleUI();
}

function updateToggleUI() {
    dom.viewToggle.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === state.viewMode);
    });
    dom.displayToggle.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.display === state.displayMode);
    });
}

// ==================== 工具函数 ====================
function goToPage(page) {
    showPage(page);
    document.querySelector('.container').scrollIntoView({ behavior: 'smooth' });
}

function showStatus(msg) {
    dom.loading.innerHTML = `<div class="spinner"></div><span>${msg}</span>`;
    dom.loading.style.display = 'block';
}

function hideStatus() {
    dom.loading.style.display = 'none';
}

function showError(msg) {
    hideStatus();
    dom.error.innerHTML = `<p>${msg}</p><button onclick="location.reload()">重试</button>`;
    dom.error.style.display = 'block';
}

function truncate(text, len) {
    return text && text.length > len ? text.substring(0, len) + '...' : text || '';
}

function stripImages(text) {
    return text ? text.replace(/!\[图片\]\([^)]+\)/g, '[图片]') : '';
}

function highlight(text) {
    if (!state.keyword) return text;
    return text.replace(new RegExp(`(${escapeRegex(state.keyword)})`, 'gi'), '<span class="highlight">$1</span>');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatTime(iso) {
    try {
        return new Date(iso).toLocaleString('zh-CN', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    } catch { return iso; }
}

// 全局函数
window.showDetail = showDetail;
window.goToPage = goToPage;
window.showImage = showImage;

// 启动
init();
