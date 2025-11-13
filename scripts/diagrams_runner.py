# scripts/diagrams_runner.py
import os, argparse, textwrap

p = argparse.ArgumentParser()
p.add_argument("--title", required=True)
p.add_argument("--format", choices=["svg","png"], default="png")  # ← 既定をPNGに
p.add_argument("--outfile", required=True)  # 拡張子なし
args = p.parse_args()

body = os.environ.get("DIAGRAMS_BODY", "")
if not body.strip():
    raise SystemExit("No diagrams body found")

# f-string 内で辞書リテラルを使うときは {{ }} でエスケープ
tmpl = f'''
from diagrams import Diagram
def _render():
{ textwrap.indent(body, "    ") }

with Diagram("{args.title}", show=False, outformat="{args.format}", filename="{args.outfile}",
             graph_attr={{"dpi": "180", "bgcolor": "transparent"}}):
    _render()
'''
exec(compile(tmpl, "<fenced_diagrams>", "exec"), {})
