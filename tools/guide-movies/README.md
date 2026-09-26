# アプリの解説（操作説明ムービー）の制作ツール

メニュー「アプリの解説」に載せる操作説明ムービーを作るための道具です。アプリ本体とは依存関係を分けています
（このフォルダの `package.json`。アプリの `npm install` / ビルド / lint には関係しません）。

アプリ側の仕組み（登録・再生）は設計書 §26、経緯は引継書「アプリの解説と操作説明ムービー」を参照。

## しくみ

| 部品 | 内容 |
|---|---|
| 映像 | 1920×1080 の HTML アニメーション（`movies/<名前>/movie.html`）。`renderAt(t)` に映像の時刻 t（秒）を渡すと1コマを描く。ヘッドレス Chrome で 30fps で1コマずつ撮影し、ffmpeg で H.264 にする |
| ナレーション | VOICEVOX エンジンの「ずんだもん（ノーマル）」。原稿は `movies/<名前>/narration.json` |
| 時間配分 | 各文が「映像のこの区間で話す」を持つ。文が区間に収まらなければ、**その区間だけ映像を引き伸ばす**（`lib/warp.mjs`） |
| BGM | 自作の合成音（外部音源なし）。楽器の出入りは `config.json` の `bgm` で指定（`lib/bgm.mjs`） |
| 合成 | ナレーション中は BGM を自動で下げ、全体 −16 LUFS（`lib/render.mjs`） |
| アプリ登録用 | 約1/3 に軽量化し、**作成日時を埋め込む**（アプリはアップロード時に動画の作成日時を読むため） |

```
tools/guide-movies/
  lib/            共通の道具（build / snap / narrate / warp / bgm / render）
  movies/
    eigyo-calendar/   「営業カレンダーの設定方法」
    eigyo-kinmu/      「営業時間と勤務時間の設定」
      config.json     タイトル・出力名・映像の長さ(end)・BGM の区間
      movie.html      映像
      narration.json  原稿 [[開始秒, 終了秒, "文"], ...]（映像の時刻）
  dictionary.json VOICEVOX のユーザー辞書（読み・アクセントの直し）
  voicevox/       VOICEVOX エンジン（git 管理外。下の「準備」）
  work/ out/      作業中のファイルと完成品（git 管理外）
```

## 準備（最初の1回）

1. Mac に Google Chrome が入っていること（別の場所なら環境変数 `CHROME_PATH`）。
2. このフォルダで `npm install`。
3. VOICEVOX エンジン（公式配布・約1.9GB）を `voicevox/engine/` に置く。
   - GitHub の VOICEVOX/voicevox_engine の Releases から `voicevox_engine-macos-arm64-<版>.vvpp` を取得し、
     zip として展開した中身を `voicevox/engine/` に置く（`voicevox/engine/run` があればよい。2026-09 は 0.25.2 を使用）。
   - 初回だけ `xattr -dr com.apple.quarantine voicevox/engine` が必要な場合がある。
   - エンジンはビルドの間だけ自動で起動・停止する（既に 50021 番で動いていればそれを使う）。

## 作り直す

```sh
cd tools/guide-movies
node lib/build.mjs eigyo-kinmu          # 全部（約6〜8分）→ out/ に2本
node lib/build.mjs eigyo-calendar kana  # 原稿の読み（カナ）だけ確認
node lib/snap.mjs eigyo-calendar 9 25 110 140   # 映像の時刻のコマを静止画で確認 → work/<名前>/snap/
```

手順を指定すると一部だけ実行できる: `kana`（読みの確認）→ `voice`（合成）→ `warp`（時間配分）→ `bgm` → `track`（ナレーションを1本に）
→ `video`（撮影）→ `mix`（合成）→ `light`（アプリ登録用）。映像だけ直したときは `video mix light`、原稿を直したら全部。

出力: `out/<出力名>.mp4`（高画質）と `out/<出力名>_アプリ登録用.mp4`（アプリに登録するのはこちら）。

## 原稿（narration.json）を直すとき

- 文を直したら、まず `kana` で読みを確認する。読み違いは:
  - 語の読み・アクセント → `dictionary.json` に登録（例: 勤務時間＝キンムジカン、月末＝ゲツマツ）
  - 無声化した「ヒ」が「人（ひと）」に聞こえる → 自動で有声に直している（`lib/narrate.mjs`）
  - 数字との組み合わせ（例:「10月末」→ じゅうげつまつ）→ 原稿の書き方を変える（「10月の月末」）
- 区間 `[開始, 終了]` は映像の時刻。文が長ければ自動でその区間の映像が伸びるので、区間はだいたいでよい。
  区間どうしが重なるとエラーにはならないが声が重なるので、前の文の終了 ≦ 次の文の開始 にする。

## 新しい手順書（ムービー）を追加するとき

1. `movies/eigyo-kinmu/` を丸ごとコピーして新しい名前にする（`eigyo-kinmu` は1本の時間軸で素直に書いてあるので雛形向き）。
2. `movie.html` の場面を書き換える。基本の決まり:
   - 要素に `data-a="出る秒,消える秒"` と `data-fx="up|left|right|pop|fade"` を付けると自動で出入りする。
   - 画面の模型（スマホ枠・カレンダー・表など）は既存の関数・CSS を流用する。実際の画面の文言・色に合わせること。
   - 指のタップは `FINGER`（時刻・対象のセレクタ・タップするか）、ズームは `CAM` で指定する。
   - `DUR`（映像の長さ）と `config.json` の `end` を合わせる。
3. `narration.json` に原稿、`config.json` にタイトル・出力名・BGM の区間を書く。
4. `snap.mjs` で要所を静止画で確認 → `build.mjs` で書き出し → 音と映像のタイミングを抜き出しコマで確認。
5. 🔴 VOICEVOX の利用規約により、動画内に「**VOICEVOX:ずんだもん**」のクレジットを入れる（既存の2本はまとめ画面の右下）。
6. アプリの設定「アプリの解説」で `…_アプリ登録用.mp4` を登録する（作成日時は自動で入る）。

### 「営業カレンダー」（eigyo-calendar）の作りについて

2026-09-26 に構成を組み替えたため、`movie.html` は「元の映像（時刻 v）」の上に「追加した場面」を重ねる作りになっている。
スクリプト末尾の `SEGS` が、合成後の時刻 t の区間ごとに「元の映像の v を再生」か「追加した場面（`data-n` の要素）」かを決める。
元の場面を直すときは v の時刻（`T` や `data-a`）、追加した場面（冒頭のしくみ・参照カード・まとめ）は t の時刻（`data-n`）で書く。
