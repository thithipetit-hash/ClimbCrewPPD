#!/usr/bin/env python3
"""Convert FFME original PDFs into selectable HTML data and text-free diagram images.

Safety constraint: extraction copies source text verbatim; no AI-written procedures.
The original PDFs and full-page screenshots remain archived as reference.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import fitz
from PIL import Image, ImageChops

FRONTEND = Path(__file__).resolve().parents[1]
SRC = FRONTEND / "public" / "assets" / "competences-ffme"
OUT = FRONTEND / "src" / "data" / "ffme-extracted.json"
ILLUSTRATIONS = SRC / "illustrations"
MANIFEST = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
MAX_SIDE = 2400


def normalize(text: str) -> str:
    # Only discard non-printing controls injected by PDF text extraction.
    return re.sub(r"[\u0000-\u0008\u000b\u000e-\u001f]", "", text)


def classify(block: dict) -> str:
    spans = [span for line in block.get("lines", []) for span in line.get("spans", [])]
    if not spans:
        return "paragraph"
    largest = max(span["size"] for span in spans)
    joined = " ".join(span["text"] for span in spans)
    bold = sum(len(span["text"]) for span in spans if "bold" in span["font"].lower())
    letters = max(1, len(joined))
    if largest >= 15 or (largest >= 11.5 and bold > letters * .55):
        return "heading"
    if joined.lstrip().startswith(("•", "▪", "●", "", "–", "- ")):
        return "list"
    return "paragraph"


def page_content(page: fitz.Page) -> tuple[list, list, int]:
    pdf = page.get_text("dict", sort=True)
    paragraphs, spans = [], []
    for block in pdf["blocks"]:
        if block["type"] != 0:
            continue
        lines = []
        for line in block.get("lines", []):
            line_spans = [span for span in line["spans"] if span.get("text", "").strip()]
            if not line_spans:
                continue
            lines.append(normalize("".join(span["text"] for span in line["spans"]).strip()))
            for span in line_spans:
                x0, y0, x1, y1 = span["bbox"]
                spans.append({
                    "text": normalize(span["text"]),
                    "x": round(max(0, x0), 2),
                    "y": round(max(0, y0), 2),
                    "size": round(span["size"], 2),
                    "color": f"#{int(span['color']) & 0xffffff:06x}",
                    "bold": "bold" in span["font"].lower(),
                    "italic": "italic" in span["font"].lower() or "oblique" in span["font"].lower(),
                })
        if lines:
            # Keep every source line exactly rather than reconstructing/editing safety rules.
            paragraphs.append({"kind": classify(block), "lines": lines})
    return paragraphs, spans, sum(len(s["text"]) for s in spans)


def extract_graphic(page: fitz.Page, stem: str):
    """Remove only PDF text objects; retain bitmap and vector diagrams."""
    source = fitz.open(page.parent.name)
    try:
        target = source[page.number]
        d = target.get_text("dict")
        count = 0
        for block in d["blocks"]:
            if block["type"] != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if not span.get("text", "").strip():
                        continue
                    rect = fitz.Rect(span["bbox"]) & target.rect
                    if rect.is_empty or rect.width < .2 or rect.height < .2:
                        continue
                    # A transparent redaction removes glyphs but preserves vector lines
                    # and bitmap illustrations (graphics=0, images=0).
                    target.add_redact_annot(rect, fill=None, cross_out=False)
                    count += 1
        if count:
            target.apply_redactions(images=0, graphics=0, text=0)
        scale = min(2.4, MAX_SIDE / max(target.rect.width, target.rect.height))
        pix = target.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False)
        original = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        diff = ImageChops.difference(original, Image.new("RGB", original.size, "white")).convert("L")
        alpha = diff.point(lambda value: 0 if value < 7 else min(255, value * 20))
        bbox = alpha.getbbox()
        if bbox is None:
            return None
        bbox = (
            max(0, bbox[0] - 8), max(0, bbox[1] - 8),
            min(pix.width, bbox[2] + 8), min(pix.height, bbox[3] + 8),
        )
        content = original.convert("RGBA")
        content.putalpha(alpha)
        content = content.crop(bbox)
        url = f"/assets/competences-ffme/illustrations/{stem}.webp"
        output_file = ILLUSTRATIONS / f"{stem}.webp"
        content.save(output_file, format="WEBP", lossless=True, method=5)
        # Ignore a few antialias pixels or a decorative rule mistaken for a diagram.
        if output_file.stat().st_size < 512:
            output_file.unlink()
            return None
        return {
            "src": url,
            "x": round(bbox[0] / scale, 2), "y": round(bbox[1] / scale, 2),
            "width": round((bbox[2] - bbox[0]) / scale, 2),
            "height": round((bbox[3] - bbox[1]) / scale, 2),
        }
    finally:
        source.close()


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    ILLUSTRATIONS.mkdir(parents=True, exist_ok=True)
    documents, report = {}, []
    for ident, expected_pages in MANIFEST["documents"].items():
        pdf_path = SRC / f"{ident}.pdf"
        if not pdf_path.is_file() or pdf_path.read_bytes()[:5] != b"%PDF-":
            raise RuntimeError(f"Missing original FFME PDF: {pdf_path}")
        with fitz.open(pdf_path) as document:
            if len(document) != len(expected_pages):
                raise RuntimeError(f"Unexpected page count for {ident}")
            pages = []
            for index, page in enumerate(document):
                paragraphs, spans, chars = page_content(page)
                illustration = extract_graphic(page, f"{ident}-{index + 1:02d}")
                pages.append({
                    "number": index + 1,
                    "width": round(page.rect.width, 2),
                    "height": round(page.rect.height, 2),
                    "paragraphs": paragraphs,
                    "spans": spans,
                    "illustration": illustration,
                })
                report.append(f"{ident} p{index+1}: {chars} text chars, {len(spans)} spans, illustration={'yes' if illustration else 'no'}")
            documents[ident] = {"pages": pages}
    if len(documents) != 12 or sum(len(x["pages"]) for x in documents.values()) != 27:
        raise RuntimeError("FFME extraction missing pages")
    # No imported statements or PDFs are replaced by generated text.
    OUT.write_text(json.dumps(documents, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (ILLUSTRATIONS / "extraction-report.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    figures = [
        page["illustration"]["src"]
        for doc in documents.values() for page in doc["pages"] if page["illustration"]
    ]
    (ILLUSTRATIONS / "manifest.json").write_text(json.dumps({"figures": figures}, indent=2) + "\n", encoding="utf-8")
    print("\n".join(report))
    print(f"Generated {OUT.relative_to(FRONTEND)} ({OUT.stat().st_size:,} bytes) from 12 original PDFs.")


if __name__ == "__main__":
    main()
