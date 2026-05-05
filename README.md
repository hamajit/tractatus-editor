# Tractatus-style Proposition Editor

Wittgenstein-style proposition editor that runs entirely in the browser.

## Features

- Tractatus numbering such as `1`, `1.1`, `2.01`, `4.001`
- Inline editing for proposition text and notes
- Add child, sibling, main proposition, and supplement propositions
- Move propositions within the same level with automatic renumbering
- Collapse and expand subtree display
- Markdown export and import
- Automatic local save with `localStorage`
- No server, no analytics, no external API calls

## Local Preview

```bash
npm start
```

Open:

```text
http://127.0.0.1:4173
```

## Tests

```bash
npm test
```

## GitHub Pages

This project is ready for GitHub Pages if this folder is used as the repository root.

### Option 1: Automatic deploy with GitHub Actions

1. Create a new GitHub repository
2. Upload the contents of this folder as the repository root
3. Push to the `main` branch
4. In GitHub, open `Settings > Pages`
5. Set `Source` to `GitHub Actions`

The included workflow will publish the site automatically.

### Option 2: Branch deploy

1. Create a new GitHub repository
2. Upload the contents of this folder as the repository root
3. In GitHub, open `Settings > Pages`
4. Set `Source` to `Deploy from a branch`
5. Choose `main` and `/ (root)`

## Notes

- Saved data stays in each browser's `localStorage`
- If you previously saved invalid legacy numbers ending in `0`, they are normalized on load
