# 日常运维QA搜索系统 - 部署指南

## 📁 文件结构

```
qa_search/
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式文件
├── js/
│   └── app.js          # 前端逻辑
├── data/
│   └── qa_data.json    # 数据文件
├── fetch_data.py       # 数据抓取脚本
├── fetch_data.bat      # Windows 快捷脚本
└── README.md           # 本文件
```

## 🚀 快速开始

### 1. 本地使用

直接双击打开 `index.html` 即可使用。

### 2. 更新数据

**方式一：双击运行**
- 双击 `fetch_data.bat`

**方式二：命令行运行**
```bash
cd qa_search
python fetch_data.py
```

### 3. 定时自动更新

使用 Windows 任务计划程序：

1. 打开"任务计划程序"
2. 创建基本任务
3. 触发器：每天
4. 操作：启动程序
   - 程序：`python`
   - 参数：`fetch_data.py`
   - 起始位置：`C:\Users\chenglin.zhan\.copaw\qa_search`

## 🌐 公网部署

### 方案一：静态托管（推荐）

将整个 `qa_search` 目录上传到任意静态托管服务：

- **GitHub Pages**（免费）
- **Vercel**（免费）
- **Cloudflare Pages**（免费）
- **阿里云 OSS**
- **腾讯云 COS**

**步骤（以 GitHub Pages 为例）：**

1. 创建 GitHub 仓库
2. 上传 `qa_search` 目录
3. Settings → Pages → Source: main branch
4. 访问 `https://用户名.github.io/仓库名`

### 方案二：自建服务器

1. 上传文件到服务器
2. 配置 Nginx/Apache 指向目录
3. 配置 HTTPS（可选）

**Nginx 配置示例：**
```nginx
server {
    listen 80;
    server_name qa.example.com;
    
    root /var/www/qa_search;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
}
```

### 方案三：Docker 部署

```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```

```bash
docker build -t qa-search .
docker run -d -p 80:80 qa-search
```

## ⏰ 定时更新（公网部署）

### 方案一：GitHub Actions（推荐）

创建 `.github/workflows/update.yml`：

```yaml
name: Update QA Data

on:
  schedule:
    - cron: '0 3 * * *'  # 每天凌晨3点
  workflow_dispatch:  # 手动触发

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Install dependencies
        run: |
          pip install playwright
          playwright install chromium
      
      - name: Fetch data
        run: python fetch_data.py
      
      - name: Commit changes
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add data/qa_data.json
          git diff --quiet && git diff --staged --quiet || git commit -m "Update QA data"
          git push
```

### 方案二：服务器 Cron

```bash
# 编辑 crontab
crontab -e

# 添加定时任务（每天3点）
0 3 * * * cd /var/www/qa_search && /usr/bin/python3 fetch_data.py >> /var/log/qa_update.log 2>&1
```

## 🔧 依赖说明

### 数据抓取依赖

```bash
pip install playwright
playwright install chromium
```

### 前端依赖

无需任何依赖，纯静态 HTML/CSS/JS。

## 📊 数据源

| 名称 | 记录数 | 更新频率 |
|-----|--------|---------|
| 日常运维QA | 27 | 随时 |
| 日常运维QA（已满） | 5169 | 随时 |
| 日常运维QA（记这个） | 704 | 随时 |

## ❓ 常见问题

### Q: 为什么数据抓取很慢？

A: 伙伴云页面需要滚动加载，数据量越大越慢。5000+条数据可能需要10-30分钟。

### Q: 如何只抓取特定来源的数据？

A: 编辑 `fetch_data.py`，修改 `SOURCES` 列表，只保留需要的来源。

### Q: 如何修改每页显示数量？

A: 编辑 `js/app.js`，修改 `CONFIG.pageSize` 的值。

### Q: 搜索支持什么语法？

A: 支持简单的关键字搜索，会在客户名称、问题描述、解决方法三个字段中匹配。

---

*最后更新: 2026-03-18*
