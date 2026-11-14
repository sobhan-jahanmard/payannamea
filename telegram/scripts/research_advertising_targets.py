"""Read public Telegram profiles/previews. No account, joins or outgoing messages."""
import argparse
import concurrent.futures
import json
import re
import statistics
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research' / '2026-11-10'

def txt(soup, selector):
    node = soup.select_one(selector)
    return node.get_text('\n', strip=True) if node else ''

def number(value):
    value = re.split(r'\b(?:subscribers|members)\b', value, flags=re.I)[0]
    value = value.replace(' ', '').replace(',', '').strip().upper()
    match = re.match(r'([\d.]+)([KM]?)', value)
    if not match:
        return None
    return round(float(match[1]) * {'': 1, 'K': 1000, 'M': 1000000}[match[2]])

def fetch(seed):
    username = seed['username']
    result = dict(seed, url=f'https://t.me/{username}', checked_on='2026-11-10')
    try:
        response = requests.get(result['url'], timeout=22)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        title = txt(soup, '.tgme_page_title')
        extra = txt(soup, '.tgme_page_extra')
        desc = txt(soup, '.tgme_page_description')
        result.update(title=title, extra=extra, description=desc,
                      members=number(extra),
                      kind='group' if 'member' in extra else 'channel' if 'subscriber' in extra else 'other',
                      profile_exists=bool(title),
                      description_handles=list(dict.fromkeys(re.findall(r'@([A-Za-z][A-Za-z0-9_]{3,31})', desc))),
                      description_links=[a.get('href') for a in soup.select('.tgme_page_description a[href]')])
        if result['kind'] == 'channel':
            preview = requests.get(f'https://t.me/s/{username}', timeout=22)
            ps = BeautifulSoup(preview.text, 'html.parser')
            messages = []
            for node in ps.select('.tgme_widget_message')[-20:]:
                date = node.select_one('time[datetime]')
                messages.append({'url': 'https://t.me/' + node.get('data-post', ''),
                                 'date': date.get('datetime') if date else None,
                                 'views': number(txt(node, '.tgme_widget_message_views'))})
            latest = max((m for m in messages if m['date']), key=lambda m: m['date'], default={})
            result['latest_visible_post'] = latest.get('date')
            result['latest_visible_post_url'] = latest.get('url')
            vs = [m['views'] for m in messages if m['views'] is not None]
            result['median_visible_views'] = statistics.median(vs) if vs else None
            result['visible_post_count'] = len(messages)
        result['fetch_status'] = 'ok'
    except Exception as exc:
        result.update(fetch_status='error', error=str(exc)[:200])
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=str(OUT/'discovery-seeds.json'))
    parser.add_argument('--output', default=str(OUT/'public-profiles.json'))
    args = parser.parse_args()
    seeds = json.loads(Path(args.input).read_text(encoding='utf-8'))
    target = Path(args.output)
    existing = json.loads(target.read_text(encoding='utf-8')) if target.exists() else []
    by_key = {r['username'].lower(): r for r in existing}
    pending = [s for s in seeds if s['username'].lower() not in by_key]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for i, result in enumerate(pool.map(fetch, pending), 1):
            by_key[result['username'].lower()] = result
            target.write_text(json.dumps(list(by_key.values()),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            print(i, result['username'], result.get('kind'), result.get('members'), result['fetch_status'], flush=True)
    print('Total profiles:', len(by_key))

if __name__ == '__main__':
    main()
