#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QA 数据抓取脚本（全量更新 + 敏感词过滤）
从伙伴云三个分享链接抓取运维QA数据

图片URL两天会过期，所以每次都全量获取，更新图片URL
图片不下载，只保留原始URL

依赖: playwright
安装: pip install playwright && playwright install chromium

使用: python fetch_data.py
"""

import json
import asyncio
import re
import sys
import io
import time
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Tuple

# 设置标准输出编码
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ===================== 配置 =====================

# 敏感词列表（替换为 ***）
SENSITIVE_WORDS = [
    '傻逼', '操你', '妈的', '他妈', '草泥马', '王八蛋', '滚蛋',
    '操', '靠', '妈逼', '牛逼', '装逼', '傻X', 'SB', 'sb',
    '妈的', 'TMD', 'tmd', '操你妈', '日你', '我日', '草你',
    '去死', '死人', '混蛋', '贱人', '婊子', '王八', '畜生',
    '傻逼的', '他妈的', '操他妈', '草他妈', '妈的个'
]

# 公司名称脱敏模式（正则）
COMPANY_PATTERNS = [
    r'[一-龥]{2,10}(期货|证券|投资|资管|基金|金融|资本|财富|银行|保险|信托)',
    r'[一-龥]{2,10}(有限公司|股份有限公司|有限责任公司)',
    r'[一-龥]{2,10}集团',
]

# 图片URL匹配模式
IMAGE_URL_PATTERN = r'https://hb-v4-attachment-oss\.huoban\.com/attachment/\d+/\d+\?[^"\'>\s]+'

# 数据源配置
SOURCES = [
    {
        "name": "日常运维QA",
        "url": "https://st2100000074204887.huoban.com/table_share?share_id=4300000373111720&secret=7FTQ4TtIs0I88siH18eL0WDrllIWA7TRsHnI0wTi&table_share_id=4100000029076881",
        "expected_count": 27
    },
    {
        "name": "日常运维QA（已满）",
        "url": "https://st2100000007530125.huoban.com/table_share?share_id=4300000055474999&secret=jIeiu1PGk9FrpEPe1uoj4u3Ijviipl1Cprp4Icjd&table_share_id=4100000000808563",
        "expected_count": 5169
    },
    {
        "name": "日常运维QA（记这个）",
        "url": "https://st2100000054900177.huoban.com/table_share?share_id=4300000367916309&secret=j1V8fY5y11e8F8IveCeIlIYyDci4JjQUa5vjsCkL&table_share_id=4100000025092149",
        "expected_count": 704
    }
]

# 输出目录
OUTPUT_DIR = Path(__file__).parent / 'data'
OUTPUT_FILE = OUTPUT_DIR / 'qa_data.json'

# 部署目录（用于复制更新后的文件）
DEPLOY_DIR = Path(__file__).parent.parent / 'qa_search_deploy'

# ===================== 工具函数 =====================

def print_progress_bar(current: int, total: int, width: int = 40, prefix: str = ""):
    """打印进度条"""
    if total == 0:
        return
    percent = min(100, int(current / total * 100))
    filled = int(width * current / total)
    bar = '█' * filled + '░' * (width - filled)
    line = f"\r{prefix}[{bar}] {current}/{total} ({percent}%)"
    sys.stdout.write(line)
    sys.stdout.flush()

def filter_sensitive_words(text: str) -> str:
    """替换敏感词为 ***"""
    if not text:
        return text
    result = text
    for word in SENSITIVE_WORDS:
        if word in result:
            result = result.replace(word, '*' * len(word))
    return result

def anonymize_company_name(text: str) -> str:
    """脱敏公司名称"""
    if not text:
        return text
    result = text
    for pattern in COMPANY_PATTERNS:
        matches = re.findall(pattern, result)
        for match in matches:
            suffix = match[-2:] if len(match) > 2 else match
            anon_name = '某某' + suffix
            result = result.replace(match, anon_name)
    return result

def filter_text(text: str) -> str:
    """综合过滤：敏感词 + 公司名称脱敏"""
    if not text:
        return text
    result = anonymize_company_name(text)
    result = filter_sensitive_words(result)
    return result

def clean_html_and_keep_images(text: str) -> str:
    """清理 HTML 标签，保留图片URL为 Markdown 格式"""
    if not text:
        return ''
    
    text = text.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&').replace('&nbsp;', ' ')
    
    # 提取图片URL并转换为 Markdown 格式
    img_urls = re.findall(IMAGE_URL_PATTERN, text)
    for url in img_urls:
        text = text.replace(url, f'![图片]({url})')
    
    # 清理HTML标签
    text = re.sub(r'<p[^>]*>', '\n', text)
    text = re.sub(r'</p>', '', text)
    text = re.sub(r'<figure[^>]*>', '', text)
    text = re.sub(r'</figure>', '', text)
    text = re.sub(r'<img[^>]*>', '', text)
    text = re.sub(r'<[^>]+>', '', text)
    
    # 清理多余换行
    text = re.sub(r'\n\s*\n+', '\n\n', text)
    text = text.strip()
    
    return text

# ===================== 抓取函数 =====================

async def fetch_source(page, source: Dict, source_index: int, total_sources: int) -> List[Dict]:
    """
    抓取单个数据源（全量模式）
    
    图片URL两天会过期，所以每次都全量抓取，更新图片URL
    """
    print(f"\n{'='*60}")
    print(f"[{source_index}/{total_sources}] 抓取: {source['name']}")
    print(f"    预期数量: ~{source['expected_count']} 条")
    print(f"    模式: 全量抓取（图片URL需每日更新）")
    print(f"{'='*60}")
    
    start_time = time.time()
    
    try:
        print("⏳ 正在打开页面...")
        await page.goto(source['url'], wait_until='networkidle', timeout=1800000)
        
        print("⏳ 等待数据加载...")
        await page.wait_for_selector('.appitem', timeout=1800000)
        await asyncio.sleep(2)
        
        # 获取当前页面已加载数量
        current_count = await page.evaluate('document.querySelectorAll(".appitem").length')
        
        # 全量模式：抓取全部数据
        target_count = source['expected_count']
        max_scroll = 500
        
        print(f"⏳ 滚动加载数据...")
        last_count = 0
        scroll_attempts = 0
        no_change_count = 0
        last_progress_time = time.time()
        
        while scroll_attempts < max_scroll:
            last_count = current_count
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            await asyncio.sleep(1.0)
            
            try:
                load_more = page.locator('text=加载更多')
                if await load_more.count() > 0:
                    await load_more.first.click()
                    await asyncio.sleep(2)
            except:
                pass
            
            current_count = await page.evaluate('document.querySelectorAll(".appitem").length')
            scroll_attempts += 1
            
            current_time = time.time()
            if current_time - last_progress_time >= 1.0:
                print_progress_bar(current_count, target_count, prefix="    进度: ")
                last_progress_time = current_time
            
            if current_count > last_count:
                no_change_count = 0
            else:
                no_change_count += 1
            
            # 停止条件：连续10次无变化或达到预期
            if no_change_count >= 10:
                break
            if current_count >= target_count and no_change_count >= 3:
                break
        
        print_progress_bar(current_count, current_count, prefix="    进度: ")
        print()
        
        elapsed = time.time() - start_time
        print(f"✅ 加载完成: {current_count} 条记录 (耗时 {elapsed:.1f}秒)")
        
        print("⏳ 正在提取数据内容...")
        
        # 提取数据
        data = await page.evaluate('''
            () => {
                const result = [];
                const items = document.querySelectorAll('.appitem');
                
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const iTexts = item.querySelectorAll('.i_text');
                    let problem = '';
                    let solution = '';
                    
                    for (let j = 0; j < iTexts.length; j++) {
                        const iText = iTexts[j];
                        const label = iText.querySelector('h4 span');
                        const value = iText.querySelector('p');
                        
                        if (label && value) {
                            const labelText = label.textContent.trim();
                            const valueText = value.innerHTML;
                            
                            if (labelText === '问题描述') {
                                problem = valueText;
                            } else if (labelText === '解决方法') {
                                solution = valueText;
                            }
                        }
                    }
                    
                    if (problem || solution) {
                        result.push({
                            problem: problem,
                            solution: solution
                        });
                    }
                }
                
                return result;
            }
        ''')
        
        print(f"✅ 提取完成: {len(data)} 条有效数据")
        return data
        
    except Exception as e:
        print(f"\n❌ 抓取失败: {e}")
        return []

# ===================== 数据处理函数 =====================

def process_data(data: List[Dict]) -> List[Dict]:
    """处理数据：清理HTML + 过滤敏感词 + 保留图片URL"""
    print("\n⏳ 处理数据内容...")
    
    processed_data = []
    
    for item in data:
        problem = item.get('problem', '')
        solution = item.get('solution', '')
        
        # 清理HTML并保留图片URL（转为Markdown格式）
        problem = clean_html_and_keep_images(problem)
        solution = clean_html_and_keep_images(solution)
        
        # 应用敏感词过滤
        problem = filter_text(problem)
        solution = filter_text(solution)
        
        processed_item = {
            'id': len(processed_data) + 1,
            'problem': problem,
            'solution': solution,
            'source': item.get('source', 'unknown')
        }
        
        processed_data.append(processed_item)
    
    # 统计图片数量
    image_count = 0
    for item in processed_data:
        image_count += len(re.findall(r'!\[图片\]\(', item.get('problem', '')))
        image_count += len(re.findall(r'!\[图片\]\(', item.get('solution', '')))
    
    if image_count > 0:
        print(f"    📷 包含图片: {image_count} 张（URL格式）")
    
    return processed_data

def copy_to_deploy_dir():
    """复制数据文件到部署目录"""
    if not DEPLOY_DIR.exists():
        print(f"⚠️  部署目录不存在: {DEPLOY_DIR}")
        return False
    
    deploy_data_dir = DEPLOY_DIR / 'data'
    deploy_data_dir.mkdir(parents=True, exist_ok=True)
    
    # 复制 qa_data.json
    dest_file = deploy_data_dir / 'qa_data.json'
    shutil.copy2(OUTPUT_FILE, dest_file)
    print(f"✅ 已复制: {dest_file}")
    
    return True

# ===================== 主函数 =====================

async def main():
    total_start = time.time()
    
    print("\n" + "=" * 60)
    print("🔍 QA 数据抓取脚本（全量更新模式）")
    print("    原因: 图片URL两天过期，需每日更新")
    print("    图片: 保留URL，不下载")
    print("=" * 60)
    print(f"📅 开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"📁 数据源数量: {len(SOURCES)} 个")
    
    # 检查依赖
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("\n❌ 请先安装 playwright:")
        print("    pip install playwright")
        print("    playwright install chromium")
        sys.exit(1)
    
    all_data = []
    
    async with async_playwright() as p:
        print("\n🌐 启动浏览器...")
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        print("✅ 浏览器已启动")
        
        for i, source in enumerate(SOURCES, 1):
            data = await fetch_source(page, source, i, len(SOURCES))
            
            for item in data:
                item['source'] = source['name']
            all_data.extend(data)
            
            if i < len(SOURCES):
                print("\n⏳ 等待 3 秒后继续...")
                await asyncio.sleep(3)
        
        await browser.close()
        print("\n🌐 浏览器已关闭")
    
    # 处理数据
    processed_data = process_data(all_data)
    
    # 统计
    print("\n" + "=" * 60)
    print("📊 最终统计")
    print("=" * 60)
    print(f"    总数据量: {len(processed_data)} 条")
    
    source_counts = {}
    for item in processed_data:
        src = item['source']
        source_counts[src] = source_counts.get(src, 0) + 1
    
    print("\n    各来源统计:")
    for src, count in source_counts.items():
        print(f"    - {src}: {count} 条")
    
    # 保存数据
    print("\n⏳ 保存数据...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump({
            'update_time': datetime.now().isoformat(),
            'total_count': len(processed_data),
            'source_stats': source_counts,
            'data': processed_data
        }, f, ensure_ascii=False, indent=2)
    
    file_size = OUTPUT_FILE.stat().st_size
    if file_size > 1024 * 1024:
        size_str = f"{file_size / 1024 / 1024:.2f} MB"
    else:
        size_str = f"{file_size / 1024:.2f} KB"
    
    print(f"✅ 数据已保存: {OUTPUT_FILE}")
    print(f"    文件大小: {size_str}")
    
    # 复制到部署目录
    print("\n⏳ 复制到部署目录...")
    copy_to_deploy_dir()
    
    total_elapsed = time.time() - total_start
    print("\n" + "=" * 60)
    print(f"⏱️  总耗时: {total_elapsed:.1f} 秒")
    print(f"📅 完成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    print("✅ 抓取完成！")
    
    return processed_data

if __name__ == '__main__':
    asyncio.run(main())
