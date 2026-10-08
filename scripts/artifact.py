"""Convierte dist-single/index.html en un fragmento publicable como artefacto (sin doctype/html/head/body)."""
import re, sys
src = open('dist-single/index.html', encoding='utf-8').read()
out_path = sys.argv[1]
title = '<title>Fistulab</title>'
links = re.findall(r'<link rel="(?:preconnect|stylesheet)"[^>]*>', src)
styles = re.findall(r'<style[^>]*>.*?</style>', src, re.S)
scripts = re.findall(r'<script type="module"[^>]*>.*?</script>', src, re.S)
body = re.search(r'<body[^>]*>(.*)</body>', src, re.S).group(1)
body = re.sub(r'<script type="module"[^>]*>.*?</script>', '', body, flags=re.S)
extra = '<style>html,body{height:100%;background:#0b1117;color:#d8e2ea;color-scheme:dark}</style>'
desc = '<meta name="description" content="Fistulab (fistulab.com): simulador de punción ecoguiada de la fístula arteriovenosa (FAV) para hemodiálisis.">'
parts = [title, desc] + links + styles + [extra, body] + scripts
open(out_path, 'w', encoding='utf-8').write('\n'.join(parts))
print(out_path, len('\n'.join(parts)) // 1024, 'KB')
