"""Build standalone lesson glossaries and their combined review page."""
from html import escape
import json
from pathlib import Path
import re
from unicodedata import normalize

ROOT = Path(__file__).resolve().parent
ETS = 'https://www.ets.org/pdfs/toeic/toeic-listening-reading-test-examinee-handbook.pdf'
FIELDS = ('term', 'pos', 'meaning', 'phrase', 'example', 'translation', 'priority')


def term_key(term):
    return re.sub(r'[\s‐‑–-]+', ' ', normalize('NFKC', term).casefold()).strip()


def load_vocabulary(source):
    path = source.with_name('vocabulary.json')
    if not path.is_file():
        return []
    entries = json.loads(path.read_text())
    if not isinstance(entries, list):
        raise ValueError(f'{path}: expected a list of vocabulary entries')
    for i, entry in enumerate(entries, 1):
        if not isinstance(entry, dict) or any(not isinstance(entry.get(field), str) or not entry[field].strip() for field in FIELDS):
            raise ValueError(f'{path}: entry {i} is missing a required text field')
        if entry['priority'] not in ('core', 'context') or not term_key(entry['term']):
            raise ValueError(f'{path}: entry {i} needs a term and a core/context priority')
    return entries


def vocabulary_css():
    return (ROOT / 'shared/styles/vocabulary.css').read_text()


def sections(entries):
    parts = []
    for priority, title, hint in [
        ('core', '建议背诵', '先记常见义和搭配，再用例句复习。'),
        ('context', '读懂即可', '阅读本文时认得这些术语即可，可留作查阅。'),
    ]:
        group = [(i, item) for i, item in enumerate(entries, 1) if item['priority'] == priority]
        if not group:
            continue
        parts.append(f'<section class="vocab-group" aria-labelledby="vocab-{priority}"><h2 id="vocab-{priority}">{title} <span>{len(group)} 项</span></h2><p class="vocab-hint">{hint}</p>')
        for i, entry in group:
            senses = []
            for sense in entry.get('senses', [entry]):
                contexts = sense.get('sources', [sense])
                excerpts = []
                for context in contexts:
                    source = f' <a href="{escape(context["href"])}">{escape(context["label"])}</a>' if 'href' in context else ''
                    excerpts.append(f'<li><span lang="en">{escape(context["phrase"])}</span>{source}</li>')
                senses.append(
                    f'<div class="vocab-sense"><p class="vocab-meaning"><span>{escape(sense["pos"])}</span> {escape(sense["meaning"])}</p>'
                    f'<div class="vocab-usage"><span class="vocab-label">原文用法</span><ul>{"".join(excerpts)}</ul>'
                    f'<p><span class="vocab-label">例句</span> <span lang="en">{escape(sense["example"])}</span></p>'
                    f'<p class="vocab-translation">{escape(sense["translation"])}</p></div></div>'
                )
            parts.append(f'<article class="vocab-entry" id="word-{i}" data-term="{escape(term_key(entry["term"]))}"><h3 lang="en">{escape(entry["term"])}</h3>{"".join(senses)}</article>')
        parts.append('</section>')
    return '\n'.join(parts)


def page(title, subtitle, nav, entries):
    template = (ROOT / 'shared/vocabulary.html').read_text()
    core = sum(entry['priority'] == 'core' for entry in entries)
    context = len(entries) - core
    counts = (f'<a href="#vocab-core">{core} 项建议背诵</a>' if core else '')
    counts += (f'<a href="#vocab-context">{context} 项读懂即可</a>' if context else '')
    values = {
        '__VOCAB_TITLE__': escape(title), '__VOCAB_SUBTITLE__': escape(subtitle), '__VOCAB_NAV__': nav,
        '__VOCAB_CSS__': vocabulary_css(), '__VOCAB_COUNTS__': counts, '__VOCAB_CONTENT__': sections(entries),
        '__ETS_URL__': ETS,
    }
    return re.sub('|'.join(values), lambda match: values[match[0]], template)


def build_vocabulary(source, data, entries):
    title = f'第 {data.get("ordinal", 1):02d} 篇词汇表'
    nav = '<a href="index.html">返回本篇练习</a><a href="../../index.html">练习目录</a><a href="../../vocabulary.html">总词汇表</a>'
    source.with_name('vocabulary.html').write_text(page(title, data['article']['title'], nav, entries))


def build_total_vocabulary(sources):
    combined = {}
    lesson_count = 0
    for source in sources:
        entries = load_vocabulary(source)
        if not entries:
            continue
        lesson_count += 1
        data = json.loads(source.read_text())
        label = f'第 {data.get("ordinal", lesson_count):02d} 篇'
        path = source.with_name('vocabulary.html').relative_to(ROOT).as_posix()
        for i, entry in enumerate(entries, 1):
            key = term_key(entry['term'])
            group = combined.setdefault(key, {'term': entry['term'], 'priority': entry['priority'], 'senses': {}})
            if entry['priority'] == 'core':
                group['priority'] = 'core'
            # Keep different meanings for the same headword, and all lesson examples from the original texts.
            sense = group['senses'].setdefault((entry['pos'], entry['meaning']), {**entry, 'sources': []})
            sense['sources'].append({'phrase': entry['phrase'], 'label': label, 'href': f'{path}#word-{i}'})
    entries = [{**group, 'senses': list(group['senses'].values())} for _, group in sorted(combined.items())]
    destination = ROOT / 'vocabulary.html'
    subtitle = f'汇总 {lesson_count} 篇练习，共 {len(entries)} 项。相同词汇合并，保留各篇原文用法。'
    destination.write_text(page('总词汇表', subtitle, '<a href="index.html">返回练习目录</a>', entries))
    return destination
