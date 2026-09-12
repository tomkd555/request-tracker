# Spec: wiki

Module id `wiki`. Depends on `store`. Inherits the shared sections of `SPEC.md`.

## Objective

Pages of Markdown for procedures and notes, shared by everyone who uses the app.

## Records

```ts
export type WikiPage = {
  id: string;        // YYYYMMDDTHHmmssSSSZ stamp at creation
  title: string;
  body: string;      // Markdown
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};
```

## Screens

- **Page list** (`/wiki`). Titles sorted alphabetically with 更新日 and 更新者; keyword filter over title; 新規ページ button.
- **Page view** (`/wiki/:id`). Rendered Markdown, 編集 and 削除 buttons, 履歴 section with 戻す like issues.
- **Page edit** (`/wiki/:id/edit`, `/wiki/new`). タイトル, textarea with a preview tab, 保存 and キャンセル.

## Behaviour

- Flat namespace; no hierarchy, no links between pages and issues in v1.
- Save writes through `store.wiki.put`, which records history.
- Delete moves the page to `trash/wiki/`.
- On `store:changed` for `wiki`, reload that page.

## Success Criteria

- Create, edit and delete a page from one client; the list in a second client reflects each step within 10 s.
- Editing a page twice yields two files under `history/wiki/<id>/`, and 戻す restores the first version.
- Markdown containing a `<script>` tag renders as text.
