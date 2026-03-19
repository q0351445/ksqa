/**
 * 日常运维QA搜索系统 - 前端逻辑（分片加载版）
 * 功能：先加载索引和第一个分片，然后按需加载其他分片
 */

// 配置
const CONFIG = {
    indexUrl: 'data/index.json',
    chunkSize: 500,
    pageSize: 20,
    preloadChunks: 2  // 预加载的分片数量
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
    isLoading: false
};

// DOM 元素
const elements = {
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    clearBtn: document.getElementById('clearBtn'),
    sourceFilter: document.getElementById('sourceFilter'),
    totalCount: document.getElementById('totalCount'),
    updateTime: document.getElementById('updateTime'),
    resultCount: document.getElementById('resultCount'),
    qaList: document.getElementById('qaList'),
    pagination: document.getElementById('pagination'),
    loading: document.getElementById('loading'),
    error: document.getElementById('error')
};

// 初始化
async function init() {
    showLoading('正在加载索引...');
    try {
        await loadIndex();
        await loadFirstChunk();
        bindEvents();
        hideLoading();
        render();
        
        // 后台预加载下一批分片
        preloadNextChunks();
    } catch (err) {
        showError();
        console.error('初始化失败:', err);
    }
}

// 加载索引
async function loadIndex() {
    const response = await fetch(CONFIG.indexUrl);
    if (!response.ok) {
        throw new Error('索引加载失败');
    }
    state.indexData = await response.json();
    
    // 更新统计显示
    elements.totalCount.textContent = `共 ${state.indexData.total_count} 条记录`;
    elements.updateTime.textContent = `更新时间: ${formatTime(state.indexData.update_time)}`;
    
    // 提取来源（需要等待数据加载）
}

// 加载第一个分片
async function loadFirstChunk() {
    if (!state.indexData || state.indexData.chunks.length === 0) {
        throw new Error('没有分片数据');
    }
    
    const firstChunk = state.indexData.chunks[0];
    await loadChunk(firstChunk);
}

// 加载指定分片
async function loadChunk(chunkInfo) {
    if (state.loadedChunks.has(chunkInfo.index)) {
        return; // 已加载
    }
    
    const response = await fetch('data/' + chunkInfo.file);
    if (!response.ok) {
        throw new Error(`分片 ${chunkInfo.index} 加载失败`);
    }
    
    const chunkData = await response.json();
    
    // 按顺序插入数据
    const start = chunkInfo.index * CONFIG.chunkSize;
    const newItems = chunkData.data || [];
    
    // 确保数组足够大
    while (state.allData.length < start) {
        state.allData.push(null);
    }
    
    // 插入数据
    newItems.forEach((item, i) => {
        state.allData[start + i] = item;
    });
    
    state.loadedChunks.add(chunkInfo.index);
    
    // 更新来源列表
    updateSources();
    
    console.log(`已加载分片 ${chunkInfo.index}，共 ${state.loadedChunks.size}/${state.indexData.chunk_count} 个分片`);
}

// 更新来源列表
function updateSources() {
    state.sources = [...new Set(state.allData.filter(d => d).map(item => item.source))];
    
    // 更新来源筛选下拉框
    const currentValue = elements.sourceFilter.value;
    elements.sourceFilter.innerHTML = '<option value="">全部</option>' +
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
    // 搜索
    elements.searchBtn.addEventListener('click', () => {
        state.keyword = elements.searchInput.value.trim();
        state.currentPage = 1;
        filterData();
        render();
    });
    
    // 回车搜索
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.searchBtn.click();
        }
    });
    
    // 清除
    elements.clearBtn.addEventListener('click', () => {
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
    
    // 滚动到分页时加载更多分片
    window.addEventListener('scroll', () => {
        if (state.isLoading) return;
        
        const scrollPercent = (window.scrollY + window.innerHeight) / document.body.scrollHeight;
        if (scrollPercent > 0.7) {
            preloadNextChunks();
        }
    });
}

// 过滤数据
function filterData() {
    let data = state.allData.filter(d => d);
    
    // 关键字过滤
    if (state.keyword) {
        const keyword = state.keyword.toLowerCase();
        data = data.filter(item =>
            (item.problem && item.problem.toLowerCase().includes(keyword)) ||
            (item.solution && item.solution.toLowerCase().includes(keyword))
        );
    }
    
    // 来源过滤
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
        elements.resultCount.textContent = `找到 ${filtered} 条结果（共 ${total} 条）`;
    } else {
        elements.resultCount.textContent = `已加载 ${loaded}/${total} 条`;
    }
}

// 渲染列表
function renderList() {
    const start = (state.currentPage - 1) * CONFIG.pageSize;
    const end = start + CONFIG.pageSize;
    const pageData = state.filteredData.slice(start, end);
    
    if (pageData.length === 0) {
        elements.qaList.innerHTML = `
            <div class="empty-state">
                <div class="icon">🔍</div>
                <p>没有找到相关记录</p>
            </div>
        `;
        return;
    }
    
    elements.qaList.innerHTML = pageData.map((item, index) => 
        renderQAItem(item, start + index + 1)
    ).join('');
    
    // 检查是否需要加载更多分片
    checkAndLoadMoreChunks(start);
}

// 检查并加载更多分片
async function checkAndLoadMoreChunks(currentStart) {
    const currentChunkIndex = Math.floor(currentStart / CONFIG.chunkSize);
    const totalChunks = state.indexData.chunk_count;
    
    // 如果当前页接近已加载数据的末尾，加载下一分片
    if (currentStart + CONFIG.pageSize > state.allData.filter(d => d).length - 50) {
        const nextChunkIndex = currentChunkIndex + 1;
        if (nextChunkIndex < totalChunks && !state.loadedChunks.has(nextChunkIndex)) {
            const chunkInfo = state.indexData.chunks[nextChunkIndex];
            if (chunkInfo) {
                state.isLoading = true;
                await loadChunk(chunkInfo);
                state.isLoading = false;
                // 重新过滤和渲染
                filterData();
                render();
            }
        }
    }
}

// 渲染单条QA
function renderQAItem(item, num) {
    const processContent = (text) => {
        if (!text) return '无';
        
        let processed = escapeHtml(text);
        
        if (state.keyword) {
            const regex = new RegExp(`(${escapeRegex(state.keyword)})`, 'gi');
            processed = processed.replace(regex, '<span class="highlight">$1</span>');
        }
        
        // 处理图片
        processed = processed.replace(
            /!\[图片\]\(([^)]+)\)/g,
            '<img src="$1" alt="图片" class="qa-image" onclick="showImageModal(this)" loading="lazy" onerror="this.style.display=\'none\'" />'
        );
        
        return processed;
    };
    
    return `
        <div class="qa-item">
            <div class="qa-header">
                <span class="qa-number">#${num}</span>
                <span class="source">${escapeHtml(item.source)}</span>
            </div>
            <div class="qa-body">
                <div class="field problem">
                    <div class="field-label">📝 问题描述</div>
                    <div class="field-content">${processContent(item.problem)}</div>
                </div>
                <div class="field solution">
                    <div class="field-label">✅ 解决方法</div>
                    <div class="field-content">${processContent(item.solution)}</div>
                </div>
            </div>
        </div>
    `;
}

// 渲染分页
function renderPagination() {
    if (state.totalPages <= 1) {
        elements.pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // 上一页
    html += `<button ${state.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${state.currentPage - 1})">上一页</button>`;
    
    // 页码
    const maxButtons = 5;
    let startPage = Math.max(1, state.currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(state.totalPages, startPage + maxButtons - 1);
    
    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }
    
    if (startPage > 1) {
        html += `<button onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
            html += `<span class="page-info">...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === state.currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    
    if (endPage < state.totalPages) {
        if (endPage < state.totalPages - 1) {
            html += `<span class="page-info">...</span>`;
        }
        html += `<button onclick="goToPage(${state.totalPages})">${state.totalPages}</button>`;
    }
    
    // 下一页
    html += `<button ${state.currentPage === state.totalPages ? 'disabled' : ''} onclick="goToPage(${state.currentPage + 1})">下一页</button>`;
    
    elements.pagination.innerHTML = html;
}

// 跳转页面
async function goToPage(page) {
    if (page < 1 || page > state.totalPages) return;
    
    // 检查目标页的数据是否已加载
    const targetStart = (page - 1) * CONFIG.pageSize;
    const targetChunk = Math.floor(targetStart / CONFIG.chunkSize);
    
    if (!state.loadedChunks.has(targetChunk)) {
        showLoading('正在加载数据...');
        const chunkInfo = state.indexData.chunks[targetChunk];
        await loadChunk(chunkInfo);
        filterData();
        hideLoading();
    }
    
    state.currentPage = page;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 显示加载状态
function showLoading(message = '加载中...') {
    elements.loading.innerHTML = `
        <div class="spinner"></div>
        <span>${message}</span>
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
        return date.toLocaleString('zh-CN');
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

// 显示图片模态框
function showImageModal(img) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.onclick = () => modal.remove();
    
    const container = document.createElement('div');
    container.className = 'image-modal-content';
    container.onclick = (e) => e.stopPropagation();
    
    const bigImg = document.createElement('img');
    bigImg.src = img.src;
    bigImg.alt = img.alt;
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'image-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => modal.remove();
    
    container.appendChild(bigImg);
    container.appendChild(closeBtn);
    modal.appendChild(container);
    document.body.appendChild(modal);
    
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

// 启动
init();
