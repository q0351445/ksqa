/**
 * 日常运维QA搜索系统 - 前端逻辑 v2.0
 * 功能：分片加载、表格/卡片双视图、详情弹窗
 */

// 配置
const CONFIG = {
    indexUrl: 'data/index.json',
    chunkSize: 500,
    pageSize: 20,
    preloadChunks: 2
};

// 状态
let state = {
    indexData: null,
    allData: [],
    filteredData: [],
    loadedChunks: new Set(),
    currentPage: 1,
    totalPages: 0,
    sources: [],
    keyword: '',
    sourceFilter: '',
    isLoading: false,
    viewMode: 'table', // 'table' 或 'card'
    isMobile: window.innerWidth <= 768
};

// DOM 元素缓存
let elements = {};

// 初始化
async function init() {
    // 缓存 DOM 元素
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
        viewToggle: document.querySelectorAll('.view-toggle button')
    };

    // 检测移动端
    if (state.isMobile) {
        state.viewMode = 'card';
    }

    showLoading('正在加载数据...');
    
    try {
        await loadIndex();
        await loadFirstChunk();
        bindEvents();
        hideLoading();
        render();
        preloadNextChunks();
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
    
    elements.totalCount.textContent = `共 ${state.indexData.total_count} 条`;
    elements.updateTime.textContent = formatTime(state.indexData.update_time);
}

// 加载第一个分片
async function loadFirstChunk() {
    if (!state.indexData || state.indexData.chunks.length === 0) {
        throw new Error('没有分片数据');
    }
    await loadChunk(state.indexData.chunks[0]);
}

// 加载指定分片
async function loadChunk(chunkInfo) {
    if (state.loadedChunks.has(chunkInfo.index)) return;
    
    const response = await fetch('data/' + chunkInfo.file);
    if (!response.ok) throw new Error(`分片 ${chunkInfo.index} 加载失败`);
    
    const chunkData = await response.json();
    const start = chunkInfo.index * CONFIG.chunkSize;
    const newItems = chunkData.data || [];
    
    while (state.allData.length < start) {
        state.allData.push(null);
    }
    
    newItems.forEach((item, i) => {
        state.allData[start + i] = item;
    });
    
    state.loadedChunks.add(chunkInfo.index);
    updateSources();
}

// 更新来源列表
function updateSources() {
    state.sources = [...new Set(state.allData.filter(d => d).map(item => item.source))];
    const currentValue = elements.sourceFilter.value;
    elements.sourceFilter.innerHTML = '<option value="">全部来源</option>' + 
        state.sources.map(s => `<option value="${s}">${s}</option>`).join('');
    elements.sourceFilter.value = currentValue;
}

// 预加载下一批分片
async function preloadNextChunks() {
    const loadedCount = state.loadedChunks.size;
    const totalChunks = state.indexData.chunk_count;
    
    for (let i = loadedCount; i < Math.min(loadedCount + CONFIG.preloadChunks, totalChunks); i++) {
        const chunkInfo = state.indexData.chunks[i];
        if (chunkInfo && !state.loadedChunks.has(chunkInfo.index)) {
            loadChunk(chunkInfo).catch(err => console.warn('预加载失败:', err));
        }
    }
}

// 绑定事件
function bindEvents() {
    // 搜索按钮
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    
    // 回车搜索
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    
    // 清除按钮
    document.getElementById('clearBtn').addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.sourceFilter.value = '';
        state.keyword = '';
        state.sourceFilter = '';
        state.currentPage = 1;
        filterData();
        render();
    });
    
    // 来源筛选
    elements.sourceFilter.addEventListener('change', () => {
        state.sourceFilter = elements.sourceFilter.value;
        state.currentPage = 1;
        filterData();
        render();
    });
    
    // 视图切换（仅PC端）
    elements.viewToggle.forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.isMobile) return;
            state.viewMode = btn.dataset.view;
            elements.viewToggle.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            render();
        });
    });
    
    // 设置初始视图按钮状态
    updateViewToggle();
    
    // 窗口大小变化
    window.addEventListener('resize', () => {
        const wasDesktop = !state.isMobile;
        state.isMobile = window.innerWidth <= 768;
        if (wasDesktop !== !state.isMobile) {
            updateViewToggle();
            if (state.isMobile) state.viewMode = 'card';
            render();
        }
    });
}

// 更新视图切换按钮状态
function updateViewToggle() {
    if (state.isMobile) {
        elements.viewToggle.forEach(btn => btn.style.display = 'none');
    } else {
        elements.viewToggle.forEach(btn => {
            btn.style.display = '';
            if (btn.dataset.view === state.viewMode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

// 执行搜索
function performSearch() {
    state.keyword = elements.searchInput.value.trim();
    state.currentPage = 1;
    filterData();
    render();
}

// 过滤数据
function filterData() {
    let data = state.allData.filter(d => d);
    
    if (state.keyword) {
        const keyword = state.keyword.toLowerCase();
        data = data.filter(item => 
            (item.problem && item.problem.toLowerCase().includes(keyword)) ||
            (item.solution && item.solution.toLowerCase().includes(keyword))
        );
    }
    
    if (state.sourceFilter) {
        data = data.filter(item => item.source === state.sourceFilter);
    }
    
    state.filteredData = data;
    state.totalPages = Math.ceil(data.length / CONFIG.pageSize);
}

// 渲染
function render() {
    renderResultCount();
    renderList();
    renderPagination();
}

// 渲染结果统计
function renderResultCount() {
    const total = state.indexData.total_count;
    const loaded = state.allData.filter(d => d).length;
    const filtered = state.filteredData.length;
    
    if (state.keyword || state.sourceFilter) {
        elements.resultCount.textContent = `找到 ${filtered} 条结果`;
    } else {
        elements.resultCount.textContent = `已加载 ${loaded}/${total} 条，点击查看详情`;
    }
}

// 渲染列表
function renderList() {
    const start = (state.currentPage - 1) * CONFIG.pageSize;
    const end = start + CONFIG.pageSize;
    const pageData = state.filteredData.slice(start, end);
    
    if (pageData.length === 0) {
        renderEmptyState();
        return;
    }
    
    if (state.viewMode === 'table' && !state.isMobile) {
        renderTableView(pageData, start);
    } else {
        renderCardView(pageData, start);
    }
}

// 渲染空状态
function renderEmptyState() {
    elements.qaList.className = 'qa-list cards';
    elements.qaList.innerHTML = `
        <div class="empty-state">
            <div class="icon">📭</div>
            <p>暂无数据</p>
        </div>
    `;
}

// 渲染表格视图
function renderTableView(pageData, start) {
    elements.qaList.className = 'qa-list table-view';
    
    let header = `
        <div class="table-header">
            <span>序号</span>
            <span>问题描述</span>
            <span>解决方法</span>
            <span>操作</span>
        </div>
    `;
    
    let rows = pageData.map((item, i) => {
        const num = start + i + 1;
        const problem = truncate(stripImages(item.problem), 80);
        const solution = truncate(stripImages(item.solution), 80);
        
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

// 渲染卡片视图
function renderCardView(pageData, start) {
    elements.qaList.className = 'qa-list cards';
    
    let cards = pageData.map((item, i) => {
        const num = start + i + 1;
        const preview = truncate(stripImages(item.problem || item.solution), 80);
        
        return `
            <div class="qa-item card" onclick="showDetail(${start + i})">
                <div class="qa-header">
                    <span class="qa-number">#${num}</span>
                    <span class="source-tag">${escapeHtml(item.source)}</span>
                </div>
                <div class="qa-preview">
                    ${highlightKeyword(escapeHtml(preview))}
                    <span class="more">...</span>
                </div>
            </div>
        `;
    }).join('');
    
    elements.qaList.innerHTML = cards;
}

// 显示详情弹窗
function showDetail(index) {
    const item = state.filteredData[index];
    if (!item) return;
    
    // 移除已有的模态框
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    
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
    
    // ESC 关闭
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

// 处理内容（高亮 + 图片）
function processContent(text) {
    if (!text) return '<span style="color:#94a3b8">无</span>';
    
    let processed = escapeHtml(text);
    
    // 处理图片
    processed = processed.replace(
        /!\[图片\]\(([^)]+)\)/g,
        '<img src="$1" alt="图片" class="qa-image" onclick="showImageModal(this)" loading="lazy" onerror="this.style.display=\'none\'" />'
    );
    
    // 高亮关键词
    if (state.keyword) {
        const regex = new RegExp(`(${escapeRegex(state.keyword)})`, 'gi');
        processed = processed.replace(regex, '<span class="highlight">$1</span>');
    }
    
    return processed;
}

// 高亮关键词
function highlightKeyword(text) {
    if (!state.keyword) return text;
    const regex = new RegExp(`(${escapeRegex(state.keyword)})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

// 去除图片标记
function stripImages(text) {
    if (!text) return '';
    return text.replace(/!\[图片\]\([^)]+\)/g, '[图片]');
}

// 截断文本
function truncate(text, length) {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) : text;
}

// 渲染分页
function renderPagination() {
    if (state.totalPages <= 1) {
        elements.pagination.innerHTML = '';
        return;
    }
    
    let html = `<button ${state.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${state.currentPage - 1})">‹</button>`;
    
    const maxButtons = 5;
    let startPage = Math.max(1, state.currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(state.totalPages, startPage + maxButtons - 1);
    
    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }
    
    if (startPage > 1) {
        html += `<button onclick="goToPage(1)">1</button>`;
        if (startPage > 2) html += `<span class="page-info">...</span>`;
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === state.currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    
    if (endPage < state.totalPages) {
        if (endPage < state.totalPages - 1) html += `<span class="page-info">...</span>`;
        html += `<button onclick="goToPage(${state.totalPages})">${state.totalPages}</button>`;
    }
    
    html += `<button ${state.currentPage === state.totalPages ? 'disabled' : ''} onclick="goToPage(${state.currentPage + 1})">›</button>`;
    
    elements.pagination.innerHTML = html;
}

// 跳转页面
async function goToPage(page) {
    if (page < 1 || page > state.totalPages) return;
    
    const targetStart = (page - 1) * CONFIG.pageSize;
    const targetChunk = Math.floor(targetStart / CONFIG.chunkSize);
    
    if (!state.loadedChunks.has(targetChunk)) {
        showLoading('正在加载数据...');
        await loadChunk(state.indexData.chunks[targetChunk]);
        filterData();
        hideLoading();
    }
    
    state.currentPage = page;
    render();
    
    // 滚动到顶部
    const container = document.querySelector('.container');
    container.scrollIntoView({ behavior: 'smooth' });
}

// 显示图片模态框
function showImageModal(img) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.onclick = () => modal.remove();
    
    modal.innerHTML = `
        <div class="image-modal-content">
            <img src="${img.src}" alt="${img.alt}">
            <span class="image-modal-close">×</span>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

// 显示加载状态
function showLoading(message = '加载中...') {
    elements.loading.innerHTML = `
        <div class="spinner"></div>
        <span class="loading-text">${message}</span>
    `;
    elements.loading.style.display = 'block';
}

// 隐藏加载状态
function hideLoading() {
    elements.loading.style.display = 'none';
}

// 显示错误
function showError() {
    elements.loading.style.display = 'none';
    elements.error.style.display = 'block';
}

// 格式化时间
function formatTime(isoString) {
    try {
        const date = new Date(isoString);
        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return isoString;
    }
}

// HTML 转义
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 正则转义
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 全局函数
window.showDetail = showDetail;
window.goToPage = goToPage;
window.showImageModal = showImageModal;

// 启动
init();
