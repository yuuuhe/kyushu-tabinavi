# 03 技術リサーチ：九州旅行アプリ（2026/11/14〜24）

調査日：2026-11-11。API の仕様・利用条件は各公式ページで確認した（出典は各節末と最後の一覧）。
「未確認」と書いたものは公式で確かめきれなかった点。

前提：個人が自分の旅行で使う・スマホ・数日で作る・費用ゼロに近い。必須機能はスポット検索、車と公共交通の所要時間、旅行期間の天気。

---

## 1. 天気

| 候補 | 先の日数 | キー | 日本での精度 | 利用条件 |
|---|---|---|---|---|
| **Open-Meteo Forecast API** | `forecast_days` 0〜16（既定7） | 不要（非商用） | 日本は Best Match で **気象庁 MSM** を使う。JMA GSM / Seamless も指定可（JMA の予報は11日先まで） | 非商用のみ無料。600回/分・5,000回/時・10,000回/日・300,000回/月。データは CC-BY 4.0（出典表示が必要） |
| **Open-Meteo Historical Weather API** | 過去（ERA5 は1940年〜、約5日遅れ） | 不要（非商用） | 再解析データ。平年値の代わりに使える | 同上 |
| **気象庁 防災情報 JSON**（`/bosai/forecast/data/forecast/{府県コード}.json`） | 短期予報は3日分、**週間予報は7日分**（11/11 17時発表の福岡県 400000 は 11/12〜11/18） | 不要 | 公式予報。週間予報に信頼度（A/B/C）と気温の幅がある。`tempAverage` / `precipAverage`（平年値と思われる。フィールド名からの推測）も入っている | 気象庁サイトの内容は「公共データ利用規約 第1.0版」で出典表示（「出典：気象庁ホームページ」と URL）。**JSON の API としての利用条件は公式に明記がない（未確認）**。仕様は予告なく変わることがある |

### 旅行期間（11/14〜24）がどこまで予報で取れるか
- 今日（11/11）時点で、Open-Meteo の16日予報は **11/26 まで**取れるので、旅行期間は全部数字が出る。ただし 11/19 以降は精度が落ちるため、画面に「参考」と表示するのがよい。
- 気象庁の週間予報は 11/18 まで。11/14〜18 は気象庁の値（信頼度つき）を主に使い、Open-Meteo と並べて見るのがよい。
- 予報範囲外・精度の低い日の扱い：
  1. Open-Meteo Historical API で過去10〜30年分の 11/14〜24 の最高・最低気温と降水量を取り、平均を出して「平年並み」として表示する（年ごとに1リクエスト。事前に計算して JSON に入れておけば、旅行中のリクエストは不要）。
  2. 気象庁 JSON の `tempAverage` を簡易的な平年値として使う。
- 毎日の出発前にアプリを開いて最新の予報を取り直す運用にする（予報は更新される）。

## 2. 地図表示

| 候補 | キー | 費用 | 日本での見やすさ | 制約 |
|---|---|---|---|---|
| **Leaflet + OSM 標準タイル**（`https://tile.openstreetmap.org/{z}/{x}/{y}.png`） | 不要 | 無料 | 地名は日本語。九州の主要地の情報は十分 | 出典表示が必須（右下が一般的、隠さない）。Referer を送る。キャッシュヘッダを守る。**一括ダウンロード・事前取得・オフライン用保存は禁止**。軽い個人利用は可だが、SLA はなく、通知なしで遮断されることがある |
| **Leaflet + 地理院タイル**（`https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png`、最大ズーム18） | 不要 | 無料 | 日本の公式地図で見やすい | 出典の明示（「地理院タイル」等とタイル一覧ページへのリンク）だけで申請不要（リアルタイム読み込みの場合）。事前取得・オフライン利用の可否はこのページに記載なし（未確認） |
| Google Maps JavaScript API | 必要 | Dynamic Maps は Essentials で月10,000回まで無料 | 最も情報が多い | API キーと課金アカウントの登録が必要（料金表ページでは確認できず。一般的には必要）。数日で用意するには手間が多い |

## 3. 経路・所要時間

### 車
| 候補 | キー | 利用条件 | 備考 |
|---|---|---|---|
| **OSRM 公開デモサーバ**（router.project-osrm.org / routing.openstreetmap.de。FOSSGIS 運営） | 不要 | **1リクエスト/秒まで**、妥当な非商用利用に限る。稼働時間やデータの鮮度は保証なし | car / foot / bike。渋滞は反映されず、所要時間は短めに出やすい。保証がないので、移動区間は**事前に計算して JSON に保存**しておくのがよい |
| Google Maps URLs（`https://www.google.com/maps/dir/?api=1&origin=..&destination=..&travelmode=driving`） | **不要** | URL は 2,048 文字まで。経由地はモバイルブラウザで最大3件 | アプリ内に時間は出ないが、渋滞込みのナビ（`dir_action=navigate`）を Google マップアプリで開ける |
| Google Routes API | 必要 | Compute Routes は Essentials で月10,000回まで無料 | 課金アカウントの登録が必要。今回は不要 |

### 公共交通（電車・バス）
- **無料で日本の電車・バス経路を返す API は見つからなかった。**
  - 公共交通オープンデータセンター（ODPT）は時刻表データ中心で、首都圏に偏っている。九州（JR九州・西鉄など）のデータがあるかは確認できなかった。経路検索 API ではない。
  - GTFS-JP（標準的なバス情報フォーマット）は各社が個別に公開しているが、九州は整備が遅れている（九州運輸局の資料）。自前で経路を探索するのは数日では無理。
  - Google Routes API の `travelMode: TRANSIT` が日本で使えるかは、カバレッジ表を取得できず**未確認**。いずれにしても課金アカウントが必要。
  - NAVITIME などの商用 API は有料のため対象外（料金ページは未確認）。
- **代替（おすすめ）**
  1. **Google マップへの深いリンク**：`https://www.google.com/maps/dir/?api=1&destination=<目的地>&travelmode=transit`（キー不要。`origin` を省くと現在地から）。押すと Google マップアプリで乗換案内が開く。
  2. **目安時間の手入力**：主要区間（例：博多→熊本 新幹線 約35分など）を出発前に調べて JSON に書いておく。オフラインでも見られ、本数の少ないローカル線やバスの「最終便」もメモできる。
  3. 必要ならジョルダン・NAVITIME の Web 版を外部リンクで開く。

## 4. スポット検索

| 候補 | キー | 利用条件 | 評価 |
|---|---|---|---|
| **自前 JSON**（事前に調べたスポット：名前・座標・営業時間・メモ・カテゴリ） | 不要 | なし | 最も確実。オフラインで動く。アプリ内の検索はこの JSON を文字列で絞り込む |
| OpenStreetMap Overpass API（overpass-api.de） | 不要 | 1日10,000クエリ・1GB 未満が目安（**定期的に使うなら1/100**）。並列実行しない。429/406 のあとは30秒待つ。User-Agent か Referer で識別。公式ページに「現在過負荷」と記載。日本国内の公開インスタンスはなし | 「近くのコンビニ・トイレ・ガソリンスタンド」など旅行中の周辺検索に使う補助。日本は営業時間などの情報が欠けていることが多い |
| Google Maps URLs の検索（`/maps/search/?api=1&query=..`） | 不要 | URL 2,048 文字まで | 口コミ・営業時間の確認は Google マップへ渡す。「現在地周辺のラーメン」なども `query` に入れるだけ |
| Google Places API (New) Text Search | 必要 | IDs Only は無制限、Pro は月5,000回まで無料 | 課金アカウントが必要。今回は不要 |

## 5. 配布方法

| 方式 | 内容 | 制約 |
|---|---|---|
| 単一 HTML（file:// で開く） | 最も簡単 | file:// は HTTPS ではないため、現在地取得や Service Worker が動かない可能性が高い（ブラウザによって違うので不可と考える） |
| **PWA（manifest + Service Worker）を静的ホスティング** | ホーム画面に追加でき、アプリ本体とデータをオフライン用に保存できる | HTTPS が必要 |
| **GitHub Pages** | 無料。HTTPS | サイトは1GB まで、帯域は月100GB（ソフトリミット）。商用サイトや SaaS 向けではない（個人利用は問題なし）。パスワードなど機密の送受信には使わない。**公開リポジトリだと旅程が公開される**点に注意（URL を知られなければ見られにくいが、非公開ではない） |
| Netlify / Cloudflare Pages など | 同様に無料枠あり | 利用規約は未確認 |

## 6. 現在地取得・オフライン時の挙動

- **Geolocation API**：HTTPS（secure context）でのみ使える。初回はユーザーの許可が必要。`getCurrentPosition` / `watchPosition`。開発時は localhost なら動く。
- **オフライン時**：
  - Service Worker でアプリ本体（HTML/JS/CSS）、スポット JSON、目安時間、平年値、最後に取得した天気（取得時刻つき）を保存しておけば、圏外でも旅程と情報は見られる。
  - OSM 標準タイルは**オフライン用の事前保存が規約で禁止**。普通に見たタイルはブラウザのキャッシュに残ることがあるが、それに頼らない。地図が出ない時はリスト表示に切り替え、Google マップアプリのオフラインマップ（事前に九州をダウンロード）を併用する。
  - GPS は圏外でも動くので、現在地の座標から自前 JSON のスポットまでの直線距離は計算できる。
  - 経路・天気の API 呼び出しは失敗するので、「オフラインです・最終更新 ○時」と表示する。

---

## おすすめ構成

**単一ページの PWA（素の HTML + JS、ビルド不要）を GitHub Pages で HTTPS 配信し、スマホのホーム画面に追加する。API キーと費用はゼロ。**

| 機能 | 使うもの |
|---|---|
| 地図 | Leaflet + 地理院タイル（日本で見やすい）。切り替えで OSM 標準タイル。両方の出典を表示 |
| スポット検索 | **自前 JSON**（事前に調べたもの）を主に使い、アプリ内で絞り込む。詳細は Google Maps URLs の検索リンクで開く。周辺検索は Overpass を「押したときだけ」1回呼ぶ（任意） |
| 車の所要時間 | 旅程の区間は出発前に OSRM デモで計算して JSON に保存（1秒1回を守る）。その場の計算も OSRM。ナビは Google Maps URLs（`travelmode=driving`） |
| 公共交通 | **目安時間を手入力した JSON** と、Google Maps URLs（`travelmode=transit`）の乗換案内リンク |
| 天気 | 11/14〜18：気象庁 JSON の週間予報 + Open-Meteo（JMA モデル）。11/19〜24：Open-Meteo 16日予報（「参考」と表示）+ Open-Meteo Historical から計算した平年値。取得結果は端末に保存 |
| 現在地 | Geolocation API（HTTPS で） |
| オフライン | Service Worker でアプリ本体・JSON・最後の天気を保存。地図はオンライン時のみ。Google マップのオフラインマップを併用 |

### 規約上の注意
- Open-Meteo：非商用のみ無料、CC-BY 4.0 の出典表示が必要。
- OSM タイル：出典表示が必須。一括ダウンロード・オフライン用の保存は禁止。
- 地理院タイル：出典の明示（リンクつき）が必要。
- OSRM デモ：1リクエスト/秒まで、非商用、保証なし。
- Overpass：連続・並列で叩かない。User-Agent / Referer で識別。
- 気象庁：「出典：気象庁ホームページ」と URL を表示。JSON の仕様は予告なく変わりうる。
- GitHub Pages：公開リポジトリだと旅程が公開される。宿の予約番号などの個人情報は載せない。

### 出典（公式ページ）
- Open-Meteo Forecast API: https://open-meteo.com/en/docs
- Open-Meteo 利用規約: https://open-meteo.com/en/terms
- Open-Meteo Historical Weather API: https://open-meteo.com/en/docs/historical-weather-api
- 気象庁 予報 JSON（福岡県の例）: https://www.jma.go.jp/bosai/forecast/data/forecast/400000.json
- 気象庁ホームページについて（利用規約）: https://www.jma.go.jp/jma/kishou/info/coment.html
- OSM Tile Usage Policy: https://operations.osmfoundation.org/policies/tiles/
- 地理院タイル一覧: https://maps.gsi.go.jp/development/ichiran.html
- OSRM Demo server: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
- Overpass API（OSM Wiki）: https://wiki.openstreetmap.org/wiki/Overpass_API
- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
- Google Maps Platform 料金: https://developers.google.com/maps/billing-and-pricing/pricing
- Google Routes API カバレッジ: https://developers.google.com/maps/documentation/routes/coverage
- MDN Geolocation API: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- GitHub Pages の制限: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- 九州運輸局資料（GTFS-JP の整備状況）: https://wwwtb.mlit.go.jp/kyushu/content/000168777.pdf
