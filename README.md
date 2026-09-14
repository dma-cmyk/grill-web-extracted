## Grill-Web

OpenAI互換APIに直接接続して、曖昧なテーマを対話形式で具体化し、AIエージェント向けの実行用プロンプトへ整理するローカルWebアプリです。

## ローカル起動

### 前提

- Node.js 18 以上
- npm

### 起動

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## Vercelデプロイ

このリポジトリにはVercel用のビルド設定を含めています。

1. VercelでこのGitHubリポジトリをImportする。
2. Production Branchを `main` にする。
3. 初回デプロイ後は、`main` へのpushで自動的に本番デプロイされる。
4. Pull RequestにはPreviewデプロイを有効化できる。

Vercel側でGitHubリポジトリを一度だけ連携する必要があります。アプリはブラウザから設定済みのOpenAI互換APIへ接続するため、接続先APIがVercelのドメインからのCORSを許可している必要があります。

## データと認証情報

- APIプロファイル、プロンプトプロファイル、セッションはブラウザのIndexedDBに保存されます。
- APIキーは保存設定をオフにするとタブ内メモリだけで保持されます。
- API接続には、接続先が許可するCORS設定が必要です。
- 実在する認証情報や個人情報をIssue、ログ、スクリーンショットへ貼り付けないでください。

## 検証用モック

API設定の組み込みモックを選択すると、外部APIなしで基本フローを確認できます。

## 検証コマンド

```bash
npm run lint
npm run build
```
