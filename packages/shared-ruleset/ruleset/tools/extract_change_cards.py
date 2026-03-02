#!/usr/bin/env python3
"""Extract shared-version change cards from 변화카드.pdf into DSL facts.

- Detects the table grid via vector stroke lines.
- Extracts per-cell text (no OCR).
- Renders each cell as a PNG for QA.
- Deduplicates only when (title, body) are identical; counts copies.
- Excludes monopoly-only cards (any card whose title/body contains '독점').

Output:
  - data/cards_shared.rules
  - assets/change_cards_cells/*.png
  - assets/change_cards_manifest.json
"""
from __future__ import annotations
import re, json, hashlib
from collections import defaultdict
from pathlib import Path
import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "변화카드.pdf"  # place the pdf next to the project root, or change this path

OUT_RULES = ROOT / "data" / "cards_shared.rules"
OUT_IMG_DIR = ROOT / "assets" / "change_cards_cells"
OUT_MANIFEST = ROOT / "assets" / "change_cards_manifest.json"

DPI = 300
MARGIN = 2.0

def normalize_text(s: str) -> str:
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    s = s.replace(" (", "(").replace("( ", "(").replace(" )", ")")
    return s

def parse_card_text(txt: str) -> tuple[str,str] | None:
    lines=[l.strip() for l in txt.splitlines() if l.strip()]
    if not lines:
        return None
    title=normalize_text(lines[0])
    body=normalize_text(" ".join(lines[1:]).strip())
    return title, body

def detect_grid(page: fitz.Page) -> tuple[list[float], list[float]]:
    xs=set(); ys=set()
    for d in page.get_drawings():
        if d.get("type") != "s":
            continue
        r=d["rect"]
        if abs(r.x0-r.x1) < 1e-3:
            xs.add(round(r.x0,1))
        if abs(r.y0-r.y1) < 1e-3:
            ys.add(round(r.y0,1))
    return sorted(xs), sorted(ys)

def card_id_for(title: str, body: str) -> str:
    h=hashlib.sha1((title+"\n"+body).encode("utf-8")).hexdigest()[:12]
    return f"cc_{h}"

def main() -> None:
    if not PDF_PATH.exists():
        raise SystemExit(f"PDF not found: {PDF_PATH}")

    doc=fitz.open(PDF_PATH.as_posix())
    OUT_IMG_DIR.mkdir(parents=True, exist_ok=True)

    entries=[]
    for pi in range(len(doc)):
        page=doc[pi]
        xs, ys = detect_grid(page)
        if len(xs) < 2 or len(ys) < 2:
            continue
        for r in range(len(ys)-1):
            for c in range(len(xs)-1):
                rect=fitz.Rect(xs[c], ys[r], xs[c+1], ys[r+1])
                clip=fitz.Rect(rect.x0+MARGIN, rect.y0+MARGIN, rect.x1-MARGIN, rect.y1-MARGIN)
                txt=page.get_text("text", clip=clip).strip()
                if not txt:
                    continue
                parsed=parse_card_text(txt)
                if not parsed:
                    continue
                title, body = parsed
                if "독점" in title or "독점" in body:
                    continue

                # render png
                mat=fitz.Matrix(DPI/72, DPI/72)
                pix=page.get_pixmap(matrix=mat, clip=rect, alpha=False)
                img_rel=f"assets/change_cards_cells/p{pi}_r{r}_c{c}.png"
                pix.save((ROOT/img_rel).as_posix())

                entries.append({
                    "page": pi, "row": r, "col": c,
                    "title": title, "body": body,
                    "image": img_rel,
                })

    # dedupe by (title, body)
    key_to_sources=defaultdict(list)
    for e in entries:
        key=(e["title"], e["body"])
        key_to_sources[key].append(e)

    # write rules
    out=[]
    out.append("% Change cards deck (공유 버전) - extracted directly from 변화카드.pdf")
    out.append("% Money unit: man (만원)")
    out.append("deck(change_cards_shared).")
    out.append("deck_money_unit(change_cards_shared, man).")
    out.append("")
    manifest=[]
    for (title, body), sources in sorted(key_to_sources.items(), key=lambda x: (x[0][0], x[0][1])):
        cid=card_id_for(title, body)
        copies=len(sources)
        is_hold = ("사용 후 카드더미로" in body)
        mode="hold" if is_hold else "instant"
        timing="choice"
        if is_hold and title.replace(" ","") == "보너스지급":
            timing="forced_immediate"

        out.append(f"card({cid}).")
        out.append(f"card_deck({cid}, change_cards_shared).")
        out.append(f"card_title({cid}, \"{title}\").")
        out.append(f"card_text({cid}, \"{body}\").")
        out.append(f"card_mode({cid}, {mode}).")
        if mode=="hold":
            out.append(f"card_hold_timing({cid}, {timing}).")
        out.append(f"card_copies({cid}, {copies}).")
        for s in sources:
            out.append(f"card_source({cid}, pdf_page({s['page']}), cell({s['row']},{s['col']}), \"{s['image']}\").")
            manifest.append({
                "card_id": cid,
                "title": title,
                "body": body,
                **{k:s[k] for k in ["page","row","col","image"]},
            })
        out.append("")

    OUT_RULES.parent.mkdir(parents=True, exist_ok=True)
    OUT_RULES.write_text("\n".join(out).strip()+"\n", encoding="utf-8")
    OUT_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    OUT_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote: {OUT_RULES}")
    print(f"Wrote: {OUT_MANIFEST}")
    print(f"Images: {OUT_IMG_DIR} ({len(entries)} cells)")

if __name__ == "__main__":
    main()
