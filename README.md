# SILroom

Chatworkのチャットルーム一覧を、スペース分離・DM分離・通知優先度で整理するChrome拡張です。

**[Chrome ウェブストアからインストール](https://chromewebstore.google.com/detail/silroom/cafpgkeajdngmfefonhhpcegjaljfkhk)**

## Features

- 左端スペースバー
- 選択中スペース内だけのチャット一覧
- 基本スペースのSVGアイコン
- ワークスペース別ロゴ登録
- ワークスペースのドラッグ並び替え
- チャットルーム一覧の幅変更と最小化
- ワークスペース一覧・チャットルーム一覧の独立スクロール
- 自分宛・通常未読バッジの色設定
- Chatworkのライトテーマ・ダークテーマに合わせた配色
- Chatworkのプレビュー・プロフィール詳細の前面表示
- 1:1チャットをDMとして扱う推定ロジック
- DMとChatworkカテゴリの両方への同時表示
- 1ルームに設定された複数カテゴリの同時反映
- ルーム単位のDM扱い/通常扱いの手動上書き
- Chatworkのカテゴリーとの所属の同期
- チャット一覧の上部からChatworkのチャット作成・カテゴリー作成・カテゴリー編集を開く
- Chatworkの開閉ボタンの強調と、押したまま動かす幅変更
- 入力欄の記法ボタン（info・title・code・hr）
- popupからの拡張UI表示と記法ボタンの切り替え
- 概要欄の上にあるChatwork AIの欄を隠す設定
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

チャットルーム一覧は右端をドラッグして幅を変更できます。入力欄の左にあるChatworkの開閉ボタンで畳むと細いルームバーになり、ルームバーにマウスを乗せると通常サイズの一覧が重なって表示されます。

## DM Handling

マイチャットはDMとは別の専用スペースに分離します。

Chatworkの1:1チャットは厳密にはDMではないため、初期版では推定で分離します。

- API補助が有効な場合は、Chatwork APIの `direct` ルームをDMとして扱う
- グループアイコンではない
- 部屋名が個人名らしい
- 手動でDM扱いにした

DMであることはルーム名の下に小さく表示します。Chatwork側でカテゴリに入れている個人チャットは、DMと該当ワークスペースの両方に表示します。複数カテゴリが設定されているルームは、それぞれのワークスペースに表示されます。自動判定が外れた場合は、各行にマウスを乗せた時だけ出る分類ボタンで上書きできます。

## Workspace Sync

ワークスペースの中身は、Chatworkのチャット一覧に開いて表示されているカテゴリーに合わせます。Chatworkでカテゴリーからルームを外すと、SILroomのワークスペースからも外れます。畳んであるカテゴリーは、開くまで前回の中身のまま表示します。

分類ボタンで上書きしたルームは、そのあとChatwork側でカテゴリーを入れ替えると上書きが外れ、自動判定に戻ります。

チャット一覧の上部にある `＋` からは、Chatworkの「グループチャットを新規作成」「コンタクトを追加」「カテゴリーを新規作成」を開けます。Chatworkのカテゴリーのワークスペースを選んでいるときは `…` も出て、そのカテゴリーの編集画面と削除の確認を開けます。作成・保存・削除はChatworkの画面で行います。

自分宛と通常未読の通知色は、拡張機能のポップアップから別々に変更できます。自分宛バッジ内の数字色は、選んだ背景色に合わせて白または濃色に自動調整されます。

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

## Fold Buttons

Chatworkの入力欄の左右にある開閉ボタンに色を付けて見つけやすくします。色はChatworkのダークテーマとライトテーマに合わせて切り替わります。

- 押す: 左のボタンはチャット一覧、右のボタンは概要欄を開く・畳む
- 押したまま横に動かす: その欄の幅を変える。畳んだ欄は、開く向きに動かすと開きながら幅を決められる

チャット一覧の幅はSILroomの設定に、概要欄の幅はChatwork自身の設定に保存されます。

## Composer Tags

入力欄のツールバーと概要の編集欄に、`[info]`・`[title]`・`[code]`・`[hr]` を入れるボタンを出します。文字を選んでから押すと、その文字を記法で囲みます。

popupの `記法ボタン` でオン・オフを切り替えられます。SILHackの記法ボタンが同じページに出ている場合は、SILroom側のボタンを出しません。

## Chatwork AI

popupの `Chatwork AI を隠す` をオンにすると、概要欄の上にあるChatwork AIの欄を出しません。初期状態はオフです。

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
      composer-tags.js
      main.js
  styles/
    popup.css
    silroom.css
  tests/
    verify-static.mjs
    fixtures/
      chatwork-like.html
```
