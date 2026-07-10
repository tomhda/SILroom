# SILroom

Chatworkのチャットルーム一覧を、スペース分離・DM分離・通知優先度で整理するChrome拡張です。

## Status

初期PoC版です。

実装済み:

- 左端スペースバー
- 選択中スペース内だけのチャット一覧
- 基本スペースのSVGアイコン
- ワークスペース別ロゴ登録
- ワークスペースのドラッグ並び替え
- チャットルーム一覧の幅変更と最小化
- 1:1チャットをDMとして扱う推定ロジック
- ルーム単位のDM扱い/通常扱いの手動上書き
- 右概要欄の開閉
- popupからの拡張UI表示と概要欄設定
- 任意のChatwork API補助

## Spaces

左端のスペースバーは常に細い幅を維持し、ホバー時だけラベルを横に浮かせます。

- 全体
- 自分宛
- 固定
- 未分類
- マイチャット
- DM
- Chatworkカテゴリ由来のワークスペース

ワークスペースを選択すると、ヘッダー左側にロゴ枠が出ます。そのロゴ枠をクリックすると画像を変更でき、左バーのワークスペースアイコンとして保存されます。

ワークスペースアイコンは左バー上でドラッグして並び替えできます。並び順はSILroom側に保存されます。

チャットルーム一覧は右端をドラッグして幅を変更できます。ヘッダーの `‹` ボタンで細いルームバー化し、ルームバーにマウスを乗せると通常サイズの一覧が重なって表示されます。`›` ボタンで固定表示へ戻せます。

## DM Handling

マイチャットはDMとは別の専用スペースに分離します。

Chatworkの1:1チャットは厳密にはDMではないため、初期版では推定で分離します。

- API補助が有効な場合は、Chatwork APIの `direct` ルームをDMとして扱う
- グループアイコンではない
- 部屋名が個人名らしい
- 手動でDM扱いにした

DMであることはルーム名の下に小さく表示します。自動判定が外れた場合は、各行にマウスを乗せた時だけ出る分類ボタンで上書きできます。

## API Assist

API補助は任意です。popupでChatwork APIトークンを保存して有効化すると、公式APIの読み取り情報を使って以下を補正します。

- `direct` / `group` / `my` によるDM判定
- 自分宛数と通常未読数
- 固定状態
- 最終更新順
- DOMに見えていないルームの補完

トークンは通常設定とは別のChromeローカルストレージキーに保存します。外部サーバーには送信せず、Chatwork公式APIへの読み取りリクエストにだけ使います。初期版では送信・編集・タスク作成系APIは実装していません。

入力場所:

1. Chrome右上の拡張機能アイコンから `SILroom` を開く
2. `Chatwork APIキー / APIトークン` に貼り付ける
3. `保存してON` を押す
4. 必要なら `接続テスト` で確認する

## Overview

右概要欄は初期状態で閉じます。右端の縦タブで開閉できます。

閉じている時は本文エリアと送信エリアが広がります。

## Local Load

1. Chromeで `chrome://extensions/` を開く
2. デベロッパーモードをオン
3. 「パッケージ化されていない拡張機能を読み込む」
4. `C:\Users\thash\code\chrome拡張\SILroom` を選択

ローカルで読み込んだ開発版は `SILroom-Dev` と表示されます。Web Store提出ZIPでは `SILroom` に自動変換されます。

ファイル更新後は、Chrome拡張一覧の `SILroom-Dev` カードでリロードしてからChatworkタブを再読み込みします。

## QA

```powershell
node --check C:\Users\thash\code\chrome拡張\SILroom\src\content\main.js
node --check C:\Users\thash\code\chrome拡張\SILroom\popup.js
C:\Users\thash\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe C:\Users\thash\code\chrome拡張\SILroom\tests\verify-static.mjs
```

Web Store提出ZIPは次のコマンドで生成します。

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\thash\code\chrome拡張\SILroom\scripts\build-webstore.ps1
```

## Structure

```text
SILroom/
  manifest.json
  popup.html
  popup.js
  README.md
  assets/
    icons/
      all.svg
      dm.svg
      mention.svg
      my.svg
      pin.svg
      power.svg
      unclassified.svg
  docs/
    design-brief.md
    technical-plan.md
  src/
    background.js
    content/
      main.js
  styles/
    popup.css
    silroom.css
  tests/
    verify-static.mjs
    fixtures/
      chatwork-like.html
```
