# Contributing

## Workflow

1. Fork repository
2. Create branch: `feat/xxx` or `fix/xxx`
3. Commit with clear message
4. Open Pull Request

## Commit Message

Recommended style:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `refactor: ...`

## Code Guidelines

- Keep userscript metadata block accurate (`@version`, `@match`)
- Keep behavior stable for both person page and question page modes
- Avoid introducing breaking output format changes without changelog updates

## Testing Checklist

- Test on `https://www.zhihu.com/people/*`
- Test on `https://www.zhihu.com/question/*`
- Verify markdown rendering in Obsidian
- Verify export interruption and retry behavior
