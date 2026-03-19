#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
单数据源抓取脚本 - 针对"日常运维QA（已满）"
解决加载更多按钮的问题
"""

import json
import asyncio
import re
import sys
import io
import time
from pathlib import Path
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# 目标数据源
SOURCE = {
    "name": "日常运维QA（已满）",
    "url": "https://st2100000007530125.huoban.com/table_share?share_id=4300000055474999&secret=jIeiu1PGk9FrpEPe1uoj4u3Ijviipl1Cprp4Icjd&table_share_id=4100000000808563",
    "expected_count": 5169
}

OUTPUT_DIR = Path(__file__).parent / 'data'
OUTPUT_FILE = OUTPUT_DIR / 'qa_data_full.json'

def print_progress_bar(current, total, width=40, prefix=""):
    if total == 0:
        return
    percent = min(100, int(current / total * 100))
    filled = int(width * current / total)
    bar = '█' * filled + '░' * (width - filled)
    line = f"\r{prefix}[{bar}] {current}/{total} ({percent}%)"
    sys.stdout.write(line)
    sys.stdout.flush()

async def fetch_source(page, source):
    """抓取单个数据源"""
    print(f"\n{'='*60}")
    print(f"抓取: {source['name']}")
    print(f"预期数量: ~{source['expected_count']} 条")
    print(f"{'='*60}")
    
    start_time = time.time()
    
    try:
        print("⏳ 正在打开页面...")
        await page.goto(source['url'], wait_until='networkidle', timeout=300000)
        
        print("⏳ 等待数据加载...")
        await page.wait_for_selector('.appitem', timeout=60000)
        await asyncio.sleep(2)
        
        target_count = source['expected_count']
        max_iterations = 1000  # 最多尝试1000次点击
        iteration = 0
        last_count = 0
        no_change_count = 0
        
        print(f"⏳ 开始点击加载更多...")
        
        while iteration < max_iterations:
            # 获取当前数量
            current_count = await page.evaluate('document.querySelectorAll(".appitem").length')
            
            # 打印进度
            if iteration % 10 == 0 or current_count != last_count:
                print_progress_bar(current_count, target_count, prefix="进度: ")
            
            # 检查是否完成
            if current_count >= target_count:
                print(f"\n✅ 已达到预期数量: {current_count}")
                break
            
            # 检查是否有变化
            if current_count == last_count:
                no_change_count += 1
                if no_change_count >= 20:
                    print(f"\n⚠️ 连续20次无变化，停止抓取。已加载: {current_count}")
                    break
            else:
                no_change_count = 0
            
            last_count = current_count
            
            # 滚动到底部
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            await asyncio.sleep(0.5)
            
            # 尝试点击"加载更多"按钮
            try:
                # 方法1: 使用 Playwright locator
                load_more = page.locator('text=加载更多')
                if await load_more.count() > 0:
                    await load_more.first.click(timeout=5000)
                    await asyncio.sleep(1.5)
                else:
                    # 方法2: 使用 JavaScript 直接查找并点击
                    clicked = await page.evaluate('''
                        (function() {
                            var buttons = document.querySelectorAll('button, div[role="button"], span, a');
                            for (var i = 0; i < buttons.length; i++) {
                                var btn = buttons[i];
                                if (btn.textContent.indexOf('加载更多') !== -1) {
                                    btn.click();
                                    return true;
                                }
                            }
                            return false;
                        })()
                    ''')
                    if clicked:
                        await asyncio.sleep(1.5)
                    else:
                        # 如果没有找到按钮，可能已经全部加载
                        await asyncio.sleep(0.5)
            except Exception as e:
                await asyncio.sleep(1)
            
            iteration += 1
        
        # 最终数量
        final_count = await page.evaluate('document.querySelectorAll(".appitem").length')
        print_progress_bar(final_count, final_count, prefix="进度: ")
        print()
        
        elapsed = time.time() - start_time
        print(f"✅ 加载完成: {final_count} 条记录 (耗时 {elapsed:.1f}秒)")
        
        # 提取数据
        print("⏳ 正在提取数据内容...")
        
        data = await page.evaluate('''
            (function() {
                var result = [];
                var items = document.querySelectorAll('.appitem');
                for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    var iTexts = item.querySelectorAll('.i_text');
                    var problem = '';
                    var solution = '';
                    for (var j = 0; j < iTexts.length; j++) {
                        var iText = iTexts[j];
                        var label = iText.querySelector('h4 span');
                        var value = iText.querySelector('p');
                        if (label && value) {
                            var labelText = label.textContent.trim();
                            var valueText = value.innerHTML;
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
                            solution: solution,
                            source: '日常运维QA（已满）'
                        });
                    }
                }
                return result;
            })()
        ''')
        
        print(f"✅ 提取完成: {len(data)} 条有效数据")
        return data
        
    except Exception as e:
        print(f"\n❌ 抓取失败: {e}")
        import traceback
        traceback.print_exc()
        return []

async def main():
    print("\n" + "=" * 60)
    print("🔍 单数据源抓取脚本")
    print(f"📅 开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("\n❌ 请先安装 playwright:")
        print("  pip install playwright")
        print("  playwright install chromium")
        sys.exit(1)
    
    async with async_playwright() as p:
        print("\n🌐 启动浏览器...")
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        print("✅ 浏览器已启动")
        
        data = await fetch_source(page, SOURCE)
        
        await browser.close()
        print("\n🌐 浏览器已关闭")
    
    if data:
        # 保存数据
        print("\n⏳ 保存数据...")
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                'update_time': datetime.now().isoformat(),
                'source': SOURCE['name'],
                'total_count': len(data),
                'data': data
            }, f, ensure_ascii=False, indent=2)
        
        file_size = OUTPUT_FILE.stat().st_size
        if file_size > 1024 * 1024:
            size_str = f"{file_size / 1024 / 1024:.2f} MB"
        else:
            size_str = f"{file_size / 1024:.2f} KB"
        
        print(f"✅ 数据已保存: {OUTPUT_FILE}")
        print(f"   文件大小: {size_str}")
        print(f"   数据条数: {len(data)}")
    
    print("\n" + "=" * 60)
    print(f"📅 完成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

if __name__ == '__main__':
    asyncio.run(main())
