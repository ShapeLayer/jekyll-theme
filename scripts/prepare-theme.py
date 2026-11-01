"""Assemble a pinned upstream theme, personal overrides, and common assets."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
name = sys.argv[1]
theme = json.loads((root / 'themes.lock.json').read_text())[name]
target = root / (name + '_deploy')
if target.exists():
    shutil.rmtree(target)
subprocess.run(['git', 'init', '-q', str(target)], check=True)
subprocess.run(['git', '-C', str(target), 'fetch', '--depth', '1',
                'https://github.com/' + theme['repository'] + '.git', theme['commit']], check=True)
subprocess.run(['git', '-C', str(target), 'checkout', '-q', 'FETCH_HEAD'], check=True)
shutil.rmtree(target / '.git')
shutil.rmtree(target / '_posts', ignore_errors=True)
for source in [root / (name + '_override'), root / 'common']:
    if source.exists():
        shutil.copytree(source, target, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.DS_Store'))
# Use one MathJax instance configured by textip before startup.
if name == 'chirpy':
    p = target / '_includes/js-selector.html'
    text = p.read_text()
    text = re.sub(r'  <script[^\n]*(?:mathjax.js|id="MathJax-script")[^\n]*\n', '', text)
    p.write_text(text)
if name == 'gitbook':
    (target / '_includes/mathjax.html').write_text('<!-- MathJax is loaded by common-elements.html. -->\n')
if name == 'contrast':
    p = target / '_includes/head.html'
    text = p.read_text()
    start = text.index('{%- if page.mathjax or site.mathjax -%}')
    end = text.index('{%- if site.comments.disqus_shortname', start)
    text = text[:start] + text[end:]
    p.write_text(text)
head = target / '_includes/head.html'
if name == 'garden':
    head = target / '_layouts/Post.html'
text = head.read_text()
hook = '{% include common-elements.html %}\n'
head.write_text(text.replace('</head>', hook + '</head>') if '</head>' in text else text + '\n' + hook)
(target / 'THEME_REVISION.json').write_text(json.dumps(theme, indent=2) + '\n')
