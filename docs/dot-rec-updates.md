# dotからRECを更新する手順

対象は既存の非公開 `gogojoe312-max/shinkou-data` の
`utacheck/prepared.json`。メンバー向け配信・共有設定は変更しない。

## 操作

1. 対象端末の適用結果の `appVersion` が16.41.58.73以上であることを先に確認する。旧アプリは新しい操作形式を扱えないため、未更新の端末に新形式を発行しない。現在の prepared.json と Git blob SHA を非公開の作業先に読む。既存操作は削除・編集しない。
2. 最初の追加操作ID、セッションID、曲ID、枠ID、メンバーIDを固定する。名前や曲名だけで対応を推測しない。
3. 変更後の `after` を作る。日付移動、メンバー順、開始・終了、休憩追加削除、歌詞・歌割を明記する。時刻は分で、終了は `at+min`。順番を変えるときも時刻を確認する。曲の進行表に出す休憩には `songId` を付ける。
4. 下のオフライン作成コマンドで次版を生成し、元の操作がすべて保持されていることを比較する。変更された元ファイルは別のSHA-256とする。
5. 既存のGitHub Contents APIで、最初に取得した blob SHA を条件に prepared.json を保存する。競合したら再読取して作り直す。無条件上書きしない。
6. 直接取得できるサーバー接続ならアプリが自動取得する。既存の暗号文配備経路の場合は、shinkou の `PREPARATION.md` に従い同じ prepared.json の正確なバイト列・SHAから `server/prepared-bundle.json` を再パッケージし、既存公開先へ反映する。非公開キューだけ更新して配備済み暗号文を放置しない。
7. アプリの適用結果を非公開 `utacheck/results/` で確認する。作成・アップロード・サーバー配備だけで完了と言わない。

進行表だけ変える場合も、変更しない歌詞の元スナップショットはそのまま含める。新曲はまず従来の `recording-addition` / `recording-song` で追加し、その後に更新する。

## 入力と生成

`before/after` の正確な管理対象形式は `recording-preparation-update.js`。
最初の `after` は `RecordingPreparationUpdate.snapshot(元の追加操作)` のコピーから作り、2回目以降は前版の `packet.after` をコピーする。`request.json` は以下の形（すべて非公開の作業先に置く）。

```json
{
  "sessionId": "synthetic-session",
  "groupId": "synthetic-private-group",
  "anchorId": "synthetic-original-addition",
  "timezone": "Asia/Tokyo",
  "source": {
    "revision": "source-v2",
    "files": [{"name": "synthetic.xlsx", "sha256": "元ファイルの64桁SHA-256"}]
  },
  "after": {"songs": ["管理対象の曲スナップショット"], "slots": ["変更後の全対象枠"]}
}
```

上の日本語の説明値を実データで置き換える。曲の `groupId` や配信情報を管理対象スナップショットに混ぜない。既存の時刻修正を引き継ぐ初回だけ `bootstrap` とその適用後の `before` を明示できる。行対応が必要なら `lineMaps`、明示的な新規メンバーには `members` を加える。

```sh
node scripts/prepare-recording-update.cjs \
  --manifest /PRIVATE/prepared.json \
  --request /PRIVATE/request.json \
  --output /PRIVATE/prepared-next.json
```

コマンドは連番・前版ハッシュ・操作ハッシュを作り、既存操作を維持して検証する。入力ファイルや既存出力を上書きせず、通信・公開は行わない。公開前に差分を確認する。`source.files[].sha256` は元資料のバイト列のSHA-256、操作の `sha256` は UTF-8 `JSON.stringify(packet)` のSHA-256で、別の値。

## アプリ側の適用確認

GitHub接続で `utacheck/results/` の各 `device-*.json` を読む。対象端末のファイルで、次をすべて確認する。

- `source.sha` が、発行した prepared.json の blob SHA と一致。
- 対象操作の `id` と `sha256` が一致し、`status` が `applied`。
- `sessions` の対象 `id/revision/operationId/sha256` が今回の版と一致。
- `localOverrides` に残した本人修正がある場合、発行内容との違いを理解した上で扱う。強制上書きしない。

`held` は対応や手修正の競合。`deferred` は未適用・入力中などの待機。
`REC_UPDATE_LOCAL_EDIT` は同じ箇所の本人修正、`REC_UPDATE_ANNOTATION` は動かせない指摘、`REC_UPDATE_LOCAL_COPY` は元Excelが同じ別コピー、`REC_UPDATE_ACTIVE_SLOT` は進行中の枠、`REC_UPDATE_PREDECESSOR` は版の連鎖不一致。保留理由を解消した変更は、未適用操作を同じIDで書き換えず、新しい `operationId` と `supersedesId`（保留中の操作ID）を指定する。同じ未適用版番号・直前版・beforeを維持し、`supersedes` に旧操作のID/ハッシュを明記した代替操作を生成する。旧操作がその端末で既に適用済みなら代替は保留される。既に適用済みの頭から続ける場合は、アプリの報告に一致する `previousId` を指定できる。分岐した版は自動統合しない。

結果がない・古い・アプリが「結果送信未確認」と表示する場合は受領未確認。別端末の結果を本人の携帯の結果と決めつけない。`observedAt` は連続した生存確認ではない。

結果保存には非公開リポジトリへの書込権限が必要。端末の既存接続が読み取りのみでも資料受信は続けられるが、結果は送信待ちになる。既存サーバーの `/healthz` の `preparationRepositoryConfigured` は設定有無だけを示し、実際の書込成功は結果JSONの保存・再読取で確認する。専用設定が必要な場合の名前は `PREPARATION_GITHUB_TOKEN`。既存の制作同期用 `GITHUB_TOKEN` やメンバー配信設定は変更しない。環境のGH_TOKENを勝手にサーバーへ保存しない。

## 最終確認

合成データによる Chromium/WebKit、幅320/390の既存リリース検証に、実際の受信→曲の歌詞→その曲の進行表→保存→ブラウザ再読み込み→競合保留→非公開結果再読取を追加した。公開時は同一コミットの `verified-release.json` とブラウザ報告・画面証跡を確認する。実機携帯の受領や、未接続の非公開端末状態まで検証済みとはしない。
