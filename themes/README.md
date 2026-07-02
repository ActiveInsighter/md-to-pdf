# PDF Theme CSS Architecture

CSS is loaded in this order:

```text
themes/base.css
  -> themes/<theme>.css
  -> style.css
```

## File roles

- `base.css`: shared Markdown/PDF structure. It should contain common selectors, layout rules, table behavior, code token mapping, print rules, and reusable CSS variables.
- `clean.css`: default visual theme. It gives the PDF slightly more breathing room, stable CJK typography, and soft code highlighting on a light code background.
- `soft.css`: alternate visual theme example. Use it as a template when adding more styles.
- `style.css`: optional project-level overrides. Keep it small.

## Select a theme

At manifest root:

```yaml
theme: clean
```

Or per job:

```yaml
jobs:
  - id: note
    type: merge
    theme: soft
    inputs: all
    output: note.pdf
```

`style:` is also accepted as an alias for `theme:`.

## Add a new theme

1. Create `themes/my-theme.css`.
2. Override variables from `base.css`.
3. Use it in manifest with `theme: my-theme`.

Prefer variable overrides over copying the full base selectors. This keeps future themes easy to maintain.
