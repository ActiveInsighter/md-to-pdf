# PDF Size Investigation

Date: 2026-09-06

Branch: `test/pdf-size-optimization`

This document records controlled tests for unusually large PDFs produced by the Chromium/Puppeteer renderer.

## Environment

- GitHub Actions: Ubuntu 24.04
- Google Chrome: 152.0.7977.64
- Puppeteer: repository dependency (`^25.3.0` at test time)
- CJK font package: `fonts-noto-cjk`
- qpdf: 11.9.0 on the runner
- Ghostscript: 10.02.1

Two fixtures were used:

- `notes.md`: Chinese/text-heavy document, 21 PDF pages
- `fixtures/render-regression.md`: CJK + KaTeX formulas + SVG, 4 PDF pages

## Benchmark results

### Text-heavy fixture (`notes.md`)

| Variant | Size | Pages | Font resources | Raster images | Change vs baseline |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium baseline | 1,188,656 B (1.134 MiB) | 21 | 192 | 0 | baseline |
| `tagged:false` only (outline kept) | 1,188,656 B (1.134 MiB) | 21 | 192 | 0 | 0.0% |
| `outline:false` only (tagged kept/default) | 1,167,676 B (1.114 MiB) | 21 | 192 | 0 | -1.8% |
| header/footer disabled | 1,180,586 B (1.126 MiB) | 21 | 171 | 0 | -0.7% |
| `tagged:false` + `outline:false` | 923,832 B (0.881 MiB) | 21 | 192 | 0 | -22.3% |
| compact CSS font weights | 1,146,569 B (1.094 MiB) | 21 | 170 | 0 | -3.5% |
| baseline + qpdf lossless rewrite | 646,143 B (0.616 MiB) | 21 | 192 | 0 | **-45.6%** |
| combined structural/font changes | 877,991 B (0.837 MiB) | 21 | 121 | 0 | -26.1% |
| combined + qpdf lossless rewrite | 580,501 B (0.554 MiB) | 21 | 121 | 0 | **-51.2%** |
| combined + Ghostscript default | 829,714 B (0.791 MiB) | 21 | 369 | 0 | -30.2% |
| combined + Ghostscript `/ebook` | 830,094 B (0.792 MiB) | 21 | 369 | 0 | -30.2% |

### Formula/SVG regression fixture

| Variant | Size | Pages | Font resources | Raster images | Change vs baseline |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium baseline | 478,386 B (0.456 MiB) | 4 | 20 | 0 | baseline |
| `tagged:false` + `outline:false` | 404,923 B (0.386 MiB) | 4 | 20 | 0 | -15.4% |
| KaTeX `html` instead of `htmlAndMathml` | 478,386 B (0.456 MiB) | 4 | 20 | 0 | 0.0% |
| combined structural/font changes | 389,127 B (0.371 MiB) | 4 | 11 | 0 | -18.7% |
| combined + qpdf lossless rewrite | 234,592 B (0.224 MiB) | 4 | 11 | 0 | **-51.0%** |
| combined + Ghostscript `/ebook` | 298,465 B (0.285 MiB) | 4 | 16 | 0 | -37.6% |

## Findings

### 1. The main issue is the direct Chromium PDF object layout, not Markdown content size

`pdffonts` reports 192 font-resource entries for the 21-page baseline. Most are repeated embedded/subset Noto Sans CJK SC Type 3 resources. This does **not** mean the complete Noto CJK package is embedded; Chromium is emitting many font subsets/resources.

The direct Chromium files contain no PDF object streams (`/ObjStm`). Rewriting the unchanged baseline with qpdf using object streams and Flate recompression reduces 1.134 MiB to 0.616 MiB while leaving all 192 font-resource entries present. Therefore the largest safe gain comes from compacting Chromium's many small PDF objects, not from deleting fonts.

### 2. qpdf is the strongest low-risk fix

Tested command (compatible with the qpdf 11.9.0 runner package):

```bash
qpdf \
  --object-streams=generate \
  --recompress-flate \
  --compression-level=9 \
  input.pdf output.pdf
```

On the baseline text PDF this reduces size by 45.6% without turning off PDF outline/bookmarks, tagged PDF structure, headers/footers, or KaTeX accessibility markup.

A page-by-page raster comparison of the 21-page combined PDF before/after qpdf at 72 DPI produced zero differing pages/pixels in the test, and `pdftotext` output was byte-identical. This supports treating this qpdf step as a lossless structural optimization for the tested output.

### 3. Do not disable tagged PDF or outline by default

Turning off `tagged` alone while keeping `outline` produced an exactly byte-identical PDF. Turning off `outline` alone while tagged structure remained saved only about 1.8%. Turning both off saved about 22.3%, but that trades away useful document structure/bookmarks/accessibility.

Because qpdf alone saved 45.6% while preserving those features, disabling both structural features is not a good default optimization.

### 4. Font-weight cleanup helps, but it is secondary

The stylesheet uses several non-standard/heavy logical weights (for example 620/650/680/720/760). Collapsing normal/medium weights to regular and heavy heading weights toward bold reduced the 21-page direct PDF by only about 3.5% (1.134 MiB -> 1.094 MiB) while reducing font-resource entries from 192 to 170.

This cleanup is reasonable as a separate typography simplification, but it should not be the primary fix because it can slightly alter text appearance.

### 5. KaTeX `htmlAndMathml` is not the size problem in these tests

Changing KaTeX output from `htmlAndMathml` to `html` produced byte-identical PDF sizes for both tested fixtures. There is therefore no measured size benefit to removing MathML, while doing so would reduce accessibility/semantic markup in the HTML source.

Recommendation: keep `htmlAndMathml`.

### 6. Raster-image optimization is document-dependent

Both test fixtures reported zero raster images with `pdfimages`; the SVG fixture remained vector content. qpdf image optimization therefore gave no meaningful improvement for these fixtures.

For image-heavy Markdown, image resizing/re-encoding should be evaluated separately. It should be an optional "compact/image-heavy" mode, not the default path for text/math PDFs.

### 7. Ghostscript is not the best default for this project

Ghostscript reduced size, but was consistently worse than qpdf on these CJK/text fixtures and rewrote the font structure aggressively (the text combined fixture increased from 121 to 369 font-resource entries). `/ebook` also represents a preset intended to trade output characteristics for size.

Recommendation: do not make Ghostscript `/ebook` the default optimizer for normal documents.

## Recommended production change

Keep the existing Puppeteer rendering options and add one lossless qpdf rewrite immediately after `page.pdf()` completes and before `pdfinfo` validation/upload:

```bash
tmp_pdf="dist/output.optimized.pdf"
qpdf \
  --object-streams=generate \
  --recompress-flate \
  --compression-level=9 \
  dist/output.pdf "$tmp_pdf"
mv "$tmp_pdf" dist/output.pdf
```

Install `qpdf` beside `poppler-utils` in the GitHub Actions job.

This is the recommended first production fix because it preserved the tested visual/text output and all current PDF features while delivering the largest low-risk reduction.

## Optional follow-up

After the qpdf fix is deployed, consider normalizing CSS font weights to a smaller set such as regular/medium/bold if visual regression tests confirm no unwanted typography changes. For image-heavy documents, add a separate optional image optimization stage based on actual image dimensions and target DPI.

## Test workflow runs

- Comprehensive benchmark: GitHub Actions run `34025419071`
- Targeted tagged/outline/footer benchmark: GitHub Actions run `34025580464`
