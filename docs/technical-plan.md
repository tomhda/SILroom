# Technical Plan

## Target

まずはChrome拡張で収める。ネイティブアプリ化は、DOM操作だけではどうしても成立しない場合の最後の選択肢にする。

## Architecture

- Manifest V3
- content scriptでChatworkページ内DOMを読む
- content scriptで補助UIを差し込む
- CSSは `silroom-` prefixに閉じる
- 設定や開閉状態は `chrome.storage` に保存する
- 任意のAPI補助はbackground service workerから読み取り専用で取得する
- 初期版では外部サーバーを使わない

## Phase 0: Preparation

完了条件:

- 拡張フォルダを作る
- `manifest.json` を作る
- content scriptの安全な起動口を作る
- 設計メモを残す

## Phase 1: Overview Drawer PoC

目的:

右概要欄を閉じられるか確認する。

作業:

- Chatwork右概要欄のDOM構造を確認
- 右概要欄の候補selectorを記録
- CSSで概要欄を隠す
- 本文エリアが広がるか確認
- 右端に開閉タブを追加
- 開閉状態を保存

判定:

- 本文エリアが自然に広がるならChrome拡張路線を継続
- レイアウト崩壊が大きいなら、Chatwork本体DOMに依存しないオーバーレイUIを検討

## Phase 2: Space Rail PoC

目的:

左端に細いスペースバーを追加し、既存チャット一覧との共存可能性を見る。

作業:

- 既存左ペインのDOM構造を確認
- 左ペイン内に拡張UIのrootを差し込む
- `全体/未読` `固定` `未分類` `マイチャット` `DM` `ワークスペース` を仮表示
- ホバー時にラベルを重ねて表示
- 選択状態を保存

## Phase 3: Room Extraction

目的:

Chatworkの部屋一覧から、部屋名・未読・固定・所属グループらしき情報を抽出する。

作業:

- ルーム行DOMを特定
- ルーム名、アイコン、固定状態、未読数を抽出
- MutationObserverで新着や並び替えに追従
- 抽出結果を拡張側リストに反映

## Phase 4: DM Detection

目的:

1:1チャットをDMとして分離できるか確認する。

候補:

- API補助が有効なら `GET /rooms` の `type: direct` を優先する
- ルーム内メンバー数が2人か
- ルーム名やアイコンの構造が1:1用か
- Chatwork側のDOM属性に種別があるか

DOMだけで判定できない場合は、初期版ではユーザーによる手動DM指定も許容する。

## Phase 5: Mention Badge

目的:

自分宛と通常未読を分ける。

候補:

- API補助が有効なら `GET /rooms` の `mention_num` / `unread_num` を優先する
- Chatwork既存の緑バッジDOMを読む
- 部屋リスト上の色やクラス差分を見る
- 本文側の未読/TO表現から補助判定する

最初から完璧にしない。取れる情報だけでまず価値を出す。

## Main Risks

- ChatworkのDOM変更に弱い
- React/Vue系の再描画で差し込んだUIが消える
- selectorが難読化されている可能性
- 自分宛情報がリストDOMだけでは取れない可能性
- グループ情報と1:1判定がDOMに露出していない可能性

## Safety Policy

- 初期版ではメッセージ送信操作に触らない
- Chatworkの通信内容を外部送信しない
- 個人名やメッセージ本文を保存しない
- 保存するのはUI設定、開閉状態、手動分類だけにする
