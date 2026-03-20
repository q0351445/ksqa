/**
 * 日常运维QA搜索系统 - 前端逻辑 v3.0
 * 功能：分离搜索与显示、后台全量搜索、前台分页加载、实时进度显示
 */

// 配置
const CONFIG = {
    indexUrl: 'data/index.json',
    chunkSize: 500,
    pageSize: 20
};

// 状态
let state = {
    indexData: null,
    displayData: [],      // 当前显示的数据（分页）
    searchData: [],       // 搜索结果数据
    allDataLoaded: false, // 是否已加载全部数据用于搜索
    loadedChunks: new Set(),
    currentPage: 1,
    totalPages: 0,
    sources: [],
    keyword: '',
    sourceFilter: '',
    isLoading: false,
    viewMode: 'table',
    displayMode: 'compact',
    isMobile: window.innerWidth <= 768,
    loadProgress: { current: 0, total: 0 }
};

// DOM 元素缓存
let elements = {};

// 初始化
async function init() {
    elements = {
        searchInput: document.getElementById('searchInput'),
        totalCount: document.getElementById('totalCount'),
        updateTime: document.getElementById('updateTime'),
        resultCount: document.getElementById('resultCount'),
        qaList: document.getElementById('qaList'),
        pagination: document.getElementById('pagination'),
        loading: document.getElementById('loading'),
        error: document.getElementById('error'),
        sourceFilter: document.getElementById('sourceFilter'),
        viewToggle: document.querySelectorAll('.view-toggle button'),
        displayToggle: document.querySelectorAll('.display-toggle button'),
        loadProgress: document.getElementById('loadProgress')
    };

    if (state.isMobile) {
        state.viewMode = 'card';
    }

    showLoading('正在加载数据索引...');
    
    try {
        await loadIndex();
        renderSourceStats();
        bindEvents();
        hideLoading();
        // 默认不加载首页数据，只显示数据源统计
        renderEmptyState();
    } catch (err) {
        showError();
        console.error('初始化失败:', err);
    }
}

// 加载索引
async function loadIndex() {
    const response = await fetch(CONFIG.indexUrl);
    if (!response.ok) throw new Error('索引加载失败');
    
    state.indexData = await response.json();
    
    // 显示总数据量
    const total = state.indexData.total_count;
    const chunks = state.indexData.chunk_count;
    elements.totalCount.innerHTML = `共 <strong>${total}</strong> 条数据，<strong>${chunks}</strong> 个分片`;
    elements.updateTime.textContent = formatTime(state.indexData.update_time);
}

// 渲染数据源统计
function renderSourceStats() {
    const stats = state.indexData.source_stats || {};
    const total = state.indexData.total_count;
    
    let html = `
        <div class="source-stats">
            <div class="stats-header">
                <span class="stats-title">📊 数据源统计</span>
                <span class="stats-total">共 ${total} 条</span>
            </div>
            <div class="stats-items">
    `;
    
    for (const [name, count] of Object.entries(stats)) {
        const percent = ((count / total) * 100).toFixed(1);
        html += `
            <div class="stats-item">
                <div class="stats-item-header">
                    <span class="source-name">${escapeHtml(name)}</span>
                    <span class="source-count">${count} 条 (${percent}%)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }
    
    html += `
            </div>
            <div class="stats-actions">
                <button class="btn-primary" onclick="loadFirstPage()">加载数据浏览</button>
                <span class="stats-hint">或输入关键词搜索</span>
            </div>
        </div>
    `;
    
    elements.qaList.innerHTML = html;
}

// 加载第一页数据
async function loadFirstPage() {
    if (state.loadedChunks.size === 0) {
        showLoadingProgress(0, state.indexData.chunk_count, '正在加载首页数据...');
        await loadChunk(0);
    }
    state.displayData = getChunkData(0).slice(0, CONFIG.pageSize);
    state.totalPages = Math.ceil(state.indexData.total_count / CONFIG.pageSize);
    state.currentPage = 1;
    renderList();
    renderPagination();
    
    // 后台预加载
    preloadChunks();
}

// 显示加载进度
function showLoadingProgress(current, total, message) {
    const percent = Math.round((current / total) * 100);
    elements.loading.innerHTML = `
        <div class="loading-progress">
            <div class="progress-text">${message}</div>
            <div class="progress-bar-container">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percent}%"></div>
                </div>
            </div>
            <div class="progress-num">${current}/${total} (${percent}%)</div>
        </div>
    `;
    elements.loading.style.display = 'block';
}

// 加载指定分片
async function loadChunk(chunkIndex) {
    if (state.loadedChunks.has(chunkIndex)) return;
    
    const chunkInfo = state.indexData.chunks[chunkIndex];
    const response = await fetch('data/' + chunkInfo.file);
    if (!response.ok) throw new Error(`分片 ${chunkIndex} 加载失败`);
    
    const chunkData = await response.json();
    
    // 存储分片数据
    if (!state.chunks) state.chunks = {};
    state.chunks[chunkIndex] = chunkData.data;
    state.loadedChunks.add(chunkIndex);
    
    state.loadProgress.current = state.loadedChunks.size;
    state.loadProgress.total = state.indexData.chunk_count;
    
    if (elements.loading.style.display !== 'none') {
        showLoadingProgress(state.loadProgress.current, state.loadProgress.total, '正在加载数据...');
    }
}

// 获取分片数据
function getChunkData(chunkIndex) {
    return state.chunks && state.chunks[chunkIndex] ? state.chunks[chunkIndex] : [];
}

// 预加载分片
async function preloadChunks() {
    const nextChunks = [1, 2, 3, 4].filter(i => !state.loadedChunks.has(i));
    for (const idx of nextChunks) {
        if (idx < state.indexData.chunk_count) {
            loadChunk(idx).catch(() => {});
        }
    }
}

// 后台加载全部数据（用于搜索）
async function loadAllDataInBackground() {
    if (state.allDataLoaded) return;
    
    const chunksToLoad = [];
    for (let i = 0; i < state.indexData.chunk_count; i++) {
        if (!state.loadedChunks.has(i)) {
            chunksToLoad.push(i);
        }
    }
    
    if (chunksToLoad.length === 0) {
        state.allDataLoaded = true;
        return;
    }
    
    // 显示搜索进度
    elements.resultCount.innerHTML = `<span class="searching">🔍 正在加载全部数据用于搜索...</span>`;
    
    for (let i = 0; i < chunksToLoad.length; i++) {
        await loadChunk(chunksToLoad[i]);
    }
    
    state.allDataLoaded = true;
}

// 执行搜索
async function performSearch() {
    state.keyword = elements.searchInput.value.trim();
    state.currentPage = 1;
    
    if (state.keyword) {
        // 先加载全部数据
        await loadAllDataInBackground();
        
        // 在全部数据中搜索
        let allData = [];
        for (let i = 0; i < state.indexData.chunk_count; i++) {
            allData = allData.concat(getChunkData(i));
        }
        
        const keyword = state.keyword.toLowerCase();
        state.searchData = allData.filter(item => 
            (item.problem && item.problem.toLowerCase().includes(keyword)) ||
            (item.solution && item.solution.toLowerCase().includes(keyword))
        );
        
        state.totalPages = Math.ceil(state.searchData.length / CONFIG.pageSize);
        elements.resultCount.textContent = `找到 ${state.searchData.length} 条结果`;
        
        // 显示搜索结果
        state.displayData = state.searchData.slice(0, CONFIG.pageSize);
        renderList();
        renderPagination();
    } else {
        // 清空搜索，显示数据源统计
        renderSourceStats();
        elements.pagination.innerHTML = '';
        elements.resultCount.textContent = '';
    }
}

// 绑定事件
function bindEvents() {
    // 搜索
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    
    // 重置
    document.getElementById('clearBtn').addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.sourceFilter.value = '';
        state.keyword = '';
        state.sourceFilter = '';
        state.searchData = [];
        state.displayData = [];
        renderSourceStats();
        elements.pagination.innerHTML = '';
        elements.resultCount.textContent = '';
    });
    
    // 来源筛选
    elements.sourceFilter.addEventListener('change', () => {
        state.sourceFilter = elements.sourceFilter.value;
        // TODO: 实现来源筛选
    });
    
    // 视图切换
    elements.viewToggle.forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.isMobile) return;
            state.viewMode = btn.dataset.view;
            elements.viewToggle.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderList();
        });
    });
    
    // 显示模式切换
    elements.displayToggle.forEach(btn => {
        btn.addEventListener('click', () => {
            state.displayMode = btn.dataset.display;
            elements.displayToggle.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderList();
        });
    });
    
    updateToggleButtons();
    
    window.addEventListener('resize', () => {
        state.isMobile = window.innerWidth <= 768;
        updateToggleButtons();
    });
}

function updateToggleButtons() {
    elements.viewToggle.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === state.viewMode);
    });
    elements.displayToggle.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.display === state.displayMode);
    });
}

// 渲染列表
function renderList() {
    if (state.displayData.length === 0) {
        renderEmptyState();
        return;
    }
    
    const start = (state.currentPage - 1) * CONFIG.pageSize;
    
    if (state.viewMode === 'table' && !state.isMobile) {
        renderTableView(state.displayData, start);
    } else {
        renderCardView(state.displayData, start);
    }
}

function renderEmptyState() {
    if (!state.keyword && state.displayData.length === 0 && state.loadedChunks.size === 0) {
        // 默认状态，显示数据源统计
        return;
    }
    elements.qaList.innerHTML = `
        <div class="empty-state">
            <div class="icon">📭</div>
            <p>${state.keyword ? '未找到相关记录' : '暂无数据'}</p>
        </div>
    `;
}

function renderTableView(data, start) {
    elements.qaList.className = 'qa-list table-view';
    let header = `
        <div class="table-header">
            <span>序号</span>
            <span>问题描述</span>
            <span>解决方法</span>
            <span>操作</span>
        </div>
    `;
    
    let rows = data.map((item, i) => {
        const num = start + i + 1;
        const problem = state.displayMode === 'compact' ? truncate(stripImages(item.problem), 60) : stripImages(item.problem);
        const solution = state.displayMode === 'compact' ? truncate(stripImages(item.solution), 60) : stripImages(item.solution);
        
        return `
            <div class="table-row" onclick="showDetail(${start + i})">
                <span class="num">${num}</span>
                <span class="content problem">${highlightKeyword(escapeHtml(problem))}</span>
                <span class="content solution">${highlightKeyword(escapeHtml(solution))}</span>
                <span class="action">详情</span>
            </div>
        `;
    }).join('');
    
    elements.qaList.innerHTML = header + rows;
}

function renderCardView(data, start) {
    elements.qaList.className = 'qa-list cards';
    
    let cards = data.map((item, i) => {
        const num = start + i + 1;
        const preview = item.problem || item.solution || '';
        const displayText = state.displayMode === 'compact' ? truncate(stripImages(preview), 50) : stripImages(preview);
        
        return `
            <div class="qa-item card" onclick="showDetail(${start + i})">
                <div class="qa-header">
                    <span class="qa-number">#${num}</span>
                    <span class="source-tag">${escapeHtml(item.source)}</span>
                </div>
                <div class="qa-preview">${highlightKeyword(escapeHtml(displayText))}</div>
            </div>
        `;
    }).join('');
    
    elements.qaList.innerHTML = cards;
}

// 显示详情
function showDetail(index) {
    const item = state.displayData[index - (state.currentPage - 1) * CONFIG.pageSize];
    if (!item) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>#${index + 1} - ${escapeHtml(item.source)}</h3>
                <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="detail-section problem">
                    <div class="section-label">问题描述</div>
                    <div class="section-content">${processContent(item.problem)}</div>
                </div>
                <div class="detail-section solution">
                    <div class="section-label">解决方法</div>
                    <div class="section-content">${processContent(item.solution)}</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.addEventListener('keydown', function handleEsc(e) {
        if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', handleEsc); }
    });
}

function processContent(text) {
    if (!text) return '<span style="color:#94a3b8">无</span>';
    let processed = escapeHtml(text);
    processed = processed.replace(/!\[图片\]\(([^)]+)\)/g, '<img src="$1" alt="图片" class="qa-image" onclick="showImageModal(this)" loading="lazy" onerror="this.style.display=\'none\'" />');
    if (state.keyword) {
        const regex = new RegExp(`(${escapeRegex(state.keyword)})`, 'gi');
        processed = processed.replace(regex, '<span class="highlight">$1</span>');
    }
    return processed;
}

function showImageModal(img) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.onclick = () => modal.remove();
    modal.innerHTML = `<div class="image-modal-content"><img src="${img.src}"><span class="image-modal-close">×</span></div>`;
    document.body.appendChild(modal);
}

function highlightKeyword(text) {
    if (!state.keyword) return text;
    return text.replace(new RegExp(`(${escapeRegex(state.keyword)})`, 'gi'), '<span class="highlight">$1</span>');
}

function stripImages(text) {
    return text ? text.replace(/!\[图片\]\([^)]+\)/g, '[图片]') : '';
}

function truncate(text, len) {
    return text && text.length > len ? text.substring(0, len) : text || '';
}

function renderPagination() {
    if (state.totalPages <= 1) { elements.pagination.innerHTML = ''; return; }
    
    let html = `<button ${state.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${state.currentPage - 1})">‹</button>`;
    
    for (let i = 1; i <= Math.min(5, state.totalPages); i++) {
        const p = state.currentPage <= 3 ? i : state.currentPage - 3 + i;
        if (p > state.totalPages) break;
        html += `<button class="${p === state.currentPage ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
    }
    
    html += `<button ${state.currentPage === state.totalPages ? 'disabled' : ''} onclick="goToPage(${state.currentPage + 1})">›</button>`;
    elements.pagination.innerHTML = html;
}

async function goToPage(page) {
    if (page < 1 || page > state.totalPages) return;
    
    const start = (page - 1) * CONFIG.pageSize;
    const chunkIndex = Math.floor(start / CONFIG.chunkSize);
    
    if (!state.loadedChunks.has(chunkIndex)) {
        showLoadingProgress(state.loadedChunks.size, state.indexData.chunk_count, '正在加载数据...');
        await loadChunk(chunkIndex);
        hideLoading();
    }
    
    // 根据是否在搜索模式，获取不同的数据源
    const dataSource = state.keyword ? state.searchData : getAllLoadedData();
    state.displayData = dataSource.slice(start, start + CONFIG.pageSize);
    state.currentPage = page;
    renderList();
    renderPagination();
    document.querySelector('.container').scrollIntoView({ behavior: 'smooth' });
}

function getAllLoadedData() {
    let all = [];
    for (let i = 0; i < state.indexData.chunk_count; i++) {
        all = all.concat(getChunkData(i));
    }
    return all;
}

function showLoading(msg) {
    elements.loading.innerHTML = `<div class="spinner"></div><span class="loading-text">${msg}</span>`;
    elements.loading.style.display = 'block';
}

function hideLoading() { elements.loading.style.display = 'none'; }
function showError() { hideLoading(); elements.error.style.display = 'block'; }

function formatTime(iso) {
    try { return new Date(iso).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}); }
    catch { return iso; }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

window.loadFirstPage = loadFirstPage;
window.showDetail = showDetail;
window.goToPage = goToPage;
window.showImageModal = showImageModal;

init();
