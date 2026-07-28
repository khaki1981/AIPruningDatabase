# AIPruningDatabase

剪定アプリ向けの植物データベースを管理する専用リポジトリです。植物ごとの剪定情報を記録するJSON、剪定方法を示す独自SVG、書籍・論文・Webサイトなどの出典情報、JSON Schemaをまとめて管理します。将来的には、別リポジトリのReactアプリ「AIPruningAssistant」から利用する予定です。

## フォルダ構成

- `plants/`: 分類別の植物JSON
- `branch-types/`: 植物間で共通利用する忌み枝・切るべき枝のJSON
- `diagrams/`: 共通図および植物別のSVG図
- `sources/`: 書籍・論文・Webサイトの出典情報
- `schema/`: 植物JSONと忌み枝JSON用のJSON Schema
- `templates/`: 新規データ作成用テンプレート
- `scripts/`: データ検証などの補助スクリプト
- `docs/`: データベース運用方針と作図ガイドライン

## データ作成の原則

- データ追加時は、出典とページ番号を必ず残してください。
- 書籍に書かれていない一般知識を、AIなどで推測して勝手に補わないでください。
- 写真や書籍の挿絵をそのまま転載せず、伝える意味を整理したうえで独自のSVGとして作図してください。
- 忌み枝は植物データから分離して共通知識として管理し、植物ごとの適用可否は出典に基づいて別途関連付けてください。
- 公開候補にする前に `npm run validate` でSchema検証を実行してください。

詳細は [`docs/database-policy.md`](docs/database-policy.md) と [`docs/svg-guidelines.md`](docs/svg-guidelines.md) を参照してください。

## 検証

```sh
npm install
npm run validate
```
