#!/usr/bin/env python3
"""Compile lesson data + reusable presentations into an offline standalone HTML."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def validate(data):
    if data.get('schemaVersion') != 1:
        raise ValueError('schemaVersion must be 1')
    for name in ('id', 'storageKey', 'collection'):
        if not isinstance(data.get(name), str) or not data[name].strip():
            raise ValueError(f'{name} must be a nonempty string')
    article = data.get('article', {})
    for name in ('title', 'subtitle', 'author', 'date', 'url', 'body'):
        if not isinstance(article.get(name), str) or not article[name].strip():
            raise ValueError(f'article.{name} must be a nonempty string')
    questions = data.get('questions')
    if not isinstance(questions, list) or not questions:
        raise ValueError('questions must be a nonempty list')
    exercise = data.get('exercise', {})
    if type(exercise.get('startNumber')) is not int or exercise['startNumber'] < 1:
        raise ValueError('exercise.startNumber must be a positive integer')
    if not isinstance(exercise.get('suggestedMinutes'), (float, int)) or exercise['suggestedMinutes'] <= 0:
        raise ValueError('exercise.suggestedMinutes must be positive')
    for index, question in enumerate(questions, 1):
        if not isinstance(question, dict):
            raise ValueError(f'Question {index}: must be an object')
        for name in ('stem', 'type', 'where', 'needle', 'explain', 'tip'):
            if not isinstance(question.get(name), str) or not question[name].strip():
                raise ValueError(f'Question {index}: {name} is required')
        options = question.get('options')
        if not isinstance(options, list) or len(options) != 4 or not all(isinstance(x, str) and x.strip() for x in options):
            raise ValueError(f'Question {index}: exactly four options are required')
        if type(question.get('answer')) is not int or question['answer'] not in range(4):
            raise ValueError(f'Question {index}: answer must be 0, 1, 2, or 3')
        if not isinstance(question.get('traps'), list) or not all(isinstance(x, str) for x in question['traps']):
            raise ValueError(f'Question {index}: traps must be a list of strings')


def build(source):
    source = source.resolve()
    data = json.loads(source.read_text())
    validate(data)
    encoded = json.dumps(data, ensure_ascii=False).replace('&', r'\u0026').replace('<', r'\u003c').replace('>', r'\u003e')
    styles = '\n'.join((ROOT / 'shared' / 'styles' / name).read_text() for name in ('exam.css', 'reading.css'))
    runtime = (ROOT / 'shared' / 'app.js').read_text()
    template = (ROOT / 'shared' / 'template.html').read_text()
    # Substitute once so article text containing a template token stays literal.
    import re
    values = {'__STYLES__': styles, '__LESSON_JSON__': encoded, '__APP_SCRIPT__': runtime}
    output = re.sub('|'.join(values), lambda m: values[m.group()], template)
    destination = source.with_name('index.html')
    destination.write_text(output)
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('lesson', nargs='?', type=Path, help='Path to a lesson.json; omit to build all lessons')
    args = parser.parse_args()
    sources = [args.lesson] if args.lesson else sorted(ROOT.glob('*/*/lesson.json'))
    if not sources:
        parser.error('No lesson.json found')
    for source in sources:
        try:
            print(build(source))
        except (ValueError, TypeError, KeyError) as error:
            raise SystemExit(f'{source}: {error}')
