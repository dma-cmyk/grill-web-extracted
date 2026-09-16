# UI/UX監査

## 対象画面

| 画面 | 実在する画面・主な責務 | 対象ソース |
|---|---|---|
| 開始 | テーマ、Prompt Profile、API Profile、使用モデル、Depth、添付、開始 | `src/features/start/StartView.tsx` |
| Grill | 質問への回答、送信、通信中断、再試行、追加ラウンド | `src/features/grill/GrillView.tsx` |
| セッション | 履歴検索、履歴・追加ラウンド・削除、Grill再開 | `src/features/sessions/SessionsView.tsx` |
| Handoff | 完成した成果物のコピー、fallback生成、Markdown保存 | `src/features/handoff/HandoffView.tsx` |
| API設定 | API Profileの作成・編集・削除、利用可能モデルの更新 | `src/features/settings/ApiProfilesView.tsx` |
| プロンプト設定 | Prompt Profileの複製・編集・削除・保存 | `src/features/settings/PromptProfilesView.tsx` |

対象は followup-round 完了後の追加ラウンド導線を含むベースライン（コミット識別子は監査記録上の短縮表記のみ）である。ソース候補は上表の6ファイルであり、ブラウザ確認は画面をまたいで実施した。

## 点検条件

- Issue #42 の目的（キャッシュ済みモデルの検索と、6画面の主要導線のUI/UX改善）を、ソース確認とブラウザ確認に分けて点検した。
- ローカル起動・検証方法は README の `npm run dev`、ブラウザのローカルURL、内蔵検証用プロファイルの利用方針に従う。本文には実行環境のホスト名、セッション識別子、認証情報、個人情報を記載しない。
- S3a のブラウザ証拠は、操作成功（action_success）と内容確認（content_verification）がともに成功した行だけを根拠にした。証拠参照は E-01〜E-09 の redacted conclusion metadata とし、raw session ID・URL・ローカルパス・秘密値は公開しない。
- S3a の結論は次のとおりである。開始のモデル検索、ラベル関連付け、フォームエラー通知、Grill/Handoff のセッション未検出をブラウザ再現済みとした。API設定のモデル取得失敗、Profile間の共有loading、Prompt設定の削除確認、コピー失敗、狭幅の操作列は未再現とした。未再現は問題が存在しないという意味ではなく、当該条件で確認できなかったことを表す。
- 既存のセッション、保存済みProfile、キャッシュ件数、マスク済みキー表示は walkthrough 中も表示を維持し、削除操作は行わなかった（D-01）。この結論はデータ保全の確認であり、値そのものの記録ではない。

## 要件対応表

### Issue #42 のモデル検索7項目

| 要件ID | 要件 | 対象画面 | 対応カード | 確認方法 |
|---|---|---|---|---|
| MS-01 | 使用モデルを検索入力から絞り込める | 開始 | `model-search` | ソース確認（現状は補助入力なし）、S3a E-01、後続のdesktop/360px確認 |
| MS-02 | モデルIDの部分一致 | 開始 | `model-search` | ソース確認・後続ブラウザ検証 |
| MS-03 | 表示名の部分一致 | 開始 | `model-search` | ソース確認・後続ブラウザ検証 |
| MS-04 | 大文字小文字・空白差を吸収 | 開始 | `model-search` | 対応カードの検索仕様確認・後続ブラウザ検証 |
| MS-05 | 件数表示と0件時の案内 | 開始 | `model-search` | 対応カードのDOM/状態確認・後続ブラウザ検証 |
| MS-06 | 条件のクリア、Profile切替時のリセット | 開始 | `model-search` | 対応カードのキーボード/状態確認・後続ブラウザ検証 |
| MS-07 | ネイティブselect、手動入力、現在の選択を壊さない | 開始 | `model-search` | ソース確認・後続ブラウザ検証（開始操作の保全を含む） |

API Profileが利用可能モデルの集合を決め、Prompt Profileがヒアリング方針を決める関係を開始画面で説明・関連付ける。モデル検索は前者を対象とし、Prompt Profileの選択は後者を変更するものとして混同させない。

### 横断要件と主要操作

| 要件ID | 要件 | 対象画面 | 対応カード | 確認方法 |
|---|---|---|---|---|
| OP-S | 検索 / 手動入力 / 開始 | 開始 | `model-search`, `start-form-a11y` | 監査: UI/AX/DOM、実装担当: `start-form-a11y`、検証担当: 後続ブラウザ |
| OP-A | モデル更新 / 編集 / 削除 | API設定 | `settings-feedback` | 監査: 操作列と失敗表示、実装・検証担当: `settings-feedback` |
| OP-P | 複製 / 編集 / 削除 / 保存 | プロンプト設定 | `settings-feedback` | 監査:確認UIと保存結果、実装・検証担当: `settings-feedback` |
| OP-SN | 履歴 / 追加ラウンド / 削除 | セッション | `session-handoff-feedback`, `responsive-actions` | 監査:主要導線、実装担当: `session-handoff-feedback`、検証担当:後続ブラウザ |
| OP-G | 回答 / 中断 / 再試行 / 追加ラウンド | Grill | `session-handoff-feedback`, `responsive-actions` | 監査:状態遷移と操作列、実装・検証担当:各後続カード |
| OP-H | コピー / fallback / Markdown保存 | Handoff | `session-handoff-feedback`, `responsive-actions` | 監査:成功・失敗表示、実装・検証担当:各後続カード |
| FM-01 | 全入力のlabel/id関連付け、必須項目、エラーの支援技術通知 | 開始 | `start-form-a11y` | S3a E-02/E-03、AX/DOM・キーボード検証 |
| FB-01 | API取得失敗を画面内に表示しProfile単位でloadingを分離 | API設定 | `settings-feedback` | S3a E-04/E-05（未再現）、失敗注入を含む後続検証 |
| FB-02 | 削除確認を共通Dialogにし、Grill/Handoffの未検出・回答・コピー失敗を画面内表示 | プロンプト設定 / Grill / Handoff | `settings-feedback`, `session-handoff-feedback` | S3a E-06/E-07/E-08（E-06/E-08未再現、E-07再現）、後続注入検証 |
| RS-01 | 6画面の長い名称と主要操作を狭幅で折り返す | 全6画面 | `responsive-actions` | desktop/360px、特にS3a E-09の未再現事項を後続検証 |
| AX-01 | 初期focusからTab/Shift+Tab、AX treeとDOMで主要導線を確認 | 全6画面 | `start-form-a11y`, `settings-feedback`, `session-handoff-feedback`, `responsive-actions` | キーボード、AX/DOMの後続実ブラウザ確認 |
| DATA-01 | IndexedDBのセッション/Profile/モデルキャッシュ、資格情報のマスキングを保全 | 全6画面 | 全後続カード（検証はオーケストレーター） | D-01の状態確認、各変更後の再確認 |

## 優先度の定義

- **P0**: Issue #42 の完了条件に直接結び付くもの。開始画面のモデル検索（MS-01〜MS-07）を最優先とする。
- **P1**: 主要導線で誤操作、操作不能、または必要な情報の欠落が起きるもの。ラベル、エラー通知、未検出、コピー失敗、Profile単位のloadingなどを含む。
- **P2**: 文言、見た目、折り返しなどの改善。主要操作を阻害する場合はP1へ繰り上げる。

根拠（状態）は次の3つを厳密に区別する。

- **ソース確認**: ソースから候補を確認したが、ブラウザで症状を再現した証拠はない。
- **ブラウザ再現済み**: S3aで操作成功と内容確認が成功し、対応する証拠行が1つある。
- **未再現**: S3aの条件では症状に到達しなかった、またはその条件を実施していない。未再現を解消・不存在の証明とは扱わない。

## 課題一覧

根拠欄の E-01〜E-09 はS3aのredacted conclusion metadataへの一対一参照である。ソース確認だけの行には証拠番号を付けず、ブラウザ再現済みとした行には重複しない番号を1つだけ付ける。

| ID | 要件ID | 画面 | 症状 | 根拠（ソース確認・ブラウザ再現） | 再現手順 | 影響 | 優先度 | 対応先 |
|---|---|---|---|---|---|---|---|---|
| C-01 | MS-01〜MS-07 | 開始 | 使用モデルのnative selectに絞り込み入力がない | **ブラウザ再現済み**（E-01: ax/dom結論、検索入力なし） | 開始画面を開き、使用モデルの操作群を確認 | キャッシュが多いと目的のモデル探索に時間がかかる | P0 | `model-search`（実装）、後続desktop/360px・キーボード検証 |
| C-02 | FM-01, AX-01 | 開始 | Prompt/API/モデル/Depthのlabelに対応するhtmlForがなく、テーマ・添付との関連付けと一貫しない | **ブラウザ再現済み**（E-02: DOM結論、関連付けなし） | 開始画面の全controlとlabelを列挙し、関連付けを確認 | 読み上げ・Tab移動時に入力の意味を特定しにくい | P1 | `start-form-a11y`（実装・AX/DOM検証） |
| C-03 | FM-01, AX-01 | 開始 | 空白だけのテーマ送信時のエラーがgeneric textで、role=alert/aria-liveがない | **ブラウザ再現済み**（E-03: ax/dom結論、通知ノードなし） | テーマに空白のみを入力して送信 | エラーを支援技術が自動通知せず、修正箇所も分かりにくい | P1 | `start-form-a11y`（実装・キーボード/AX検証） |
| C-04 | FB-01 | API設定 | モデル取得失敗をalertで表示する経路がある | **ソース確認、未再現**（E-04: built-in refresh成功、失敗経路未到達） | API設定でモデル更新を実行し、失敗応答を与える | 画面内のProfile単位で失敗内容を確認できない可能性 | P1 | `settings-feedback`（失敗注入・画面内表示検証） |
| C-05 | FB-01 | API設定 | fetchingModelsが全Profile共通で、1件取得中に他Profile操作を止める可能性 | **ソース確認、未再現**（E-05: Profileが1件で比較不能） | 複数Profileを用意し、一方のモデル更新中に他方を操作 | 不要な操作不能やloading表示の誤結び付け | P1 | `settings-feedback`（Profile別状態、複数Profile検証） |
| C-06 | FB-02 | プロンプト設定 | 削除確認がwindow.confirmに依存する | **ソース確認、未再現**（E-06: built-inのみで削除操作なし） | 削除可能なPrompt Profileを用意して削除を開始 | 共通Dialog、支援技術、画面内状態と挙動が揃わない | P1 | `settings-feedback`（Dialog化・AX検証） |
| C-07 | FB-02 | Grill / Handoff | セッション未検出時にalert後、セッション一覧へ自動遷移する | **ブラウザ再現済み**（E-07: ax/state結論、Grillで再現。Handoffは同じソースパターンだが個別強制は未実施） | 存在しないGrillセッションへ移動し、alertを処理 | ダイアログ処理まで画面が進まず、意図しない自動遷移になる | P1 | `session-handoff-feedback`（画面内未検出表示。Handoff個別検証） |
| C-08 | FB-02, OP-H | Grill / Handoff | クリップボード失敗時の画面通知・手動コピー案内がない | **ソース確認、未再現**（E-08: 成功UIは到達、失敗経路未再現） | Handoff/Grillのコピーでclipboardを拒否させる | コピーできたか分からず成果物を失う可能性 | P1 | `session-handoff-feedback`（失敗注入・手動手段、後続検証） |
| C-09 | RS-01 | セッション / API設定 / Grill / Handoff | 操作列がshrink-0等のままで狭幅折り返しを保証しない | **ソース確認、未再現**（E-09: desktop DOM確認のみ、360px未実施） | 対象操作列をdesktopと360pxで確認 | 長い名称・主要操作が画面外へはみ出し操作不能になる可能性 | P1 | `responsive-actions`（6画面desktop/360px・keyboard・AX/DOM検証） |

### ブラウザ証拠のredacted参照

| 参照 | 画面 | S3aで実施した操作 | 結論 |
|---|---|---|---|
| E-01 | 開始 | 使用モデルcontrolを読み取り | native selectはあるが検索入力なし（再現済み） |
| E-02 | 開始 | controlとlabelを列挙 | 複数labelにhtmlFor対応なし（再現済み） |
| E-03 | 開始 | 空白テーマを送信 | エラー通知ノードなし（再現済み） |
| E-04 | API設定 | モデル更新 | 成功し失敗経路未到達（未再現） |
| E-05 | API設定 | Profile一覧と更新controlを確認 | 1 Profileのみで比較不能（未再現） |
| E-06 | プロンプト設定 | Profile操作を列挙 | 削除操作なし（未再現） |
| E-07 | Grill / Handoff | 存在しないGrillセッションへ移動 | alert後に一覧へ遷移（Grillのみ再現） |
| E-08 | Grill / Handoff | 既存Handoffでcopyを実行 | 成功UI到達、失敗経路未再現 |
| E-09 | セッションほか | desktopの操作列DOMを確認 | 狭幅未実施、後続カードへ委譲 |

## 本Issueで扱う範囲

本Issueは監査と優先順位付けを完了し、実装は後続カードへ分割する。開始画面のモデル検索を **P0** とし、他の主要導線はP1を中心に、文言・外観だけの改善をP2として扱う。

| 範囲 | 対象 | 担当カード / 確認担当 | 対象外・保全条件 |
|---|---|---|---|
| モデル検索 | 開始の検索、部分一致、件数、0件、クリア、Profile切替、native select/手動入力 | `model-search`、実装後はオーケストレーターがdesktop/360px/キーボード/AX+DOM確認 | モデル一覧の取得契約、並び順、手動入力の意味は変更しない |
| フォーム意味論 | 開始のlabel/id、必須、エラー通知、API ProfileとPrompt Profileの関係説明 | `start-form-a11y`、実装担当とAX/DOM検証担当を分離 | API Profileが利用可能モデル、Prompt Profileがヒアリング方針という関係を保持 |
| 設定フィードバック | API取得失敗の画面内表示・Profile別loading、Prompt削除Dialog | `settings-feedback`、オーケストレーターが失敗注入とkeyboard/AX確認 | 実在の認証情報・Profile値を文書・ログに保存しない |
| セッション/Grill/Handoff | 未検出、回答・中断・再試行・追加ラウンド、コピー失敗、fallback、Markdown保存 | `session-handoff-feedback`、オーケストレーターが状態/clipboard確認 | セッション本文、秘密値、個人情報を証拠化しない |
| 狭幅 | 全6画面の主要操作、長い名称、操作列 | `responsive-actions`、オーケストレーターがdesktop/360px/keyboard/AX確認 | 文言・アクセシブルな名前・処理を変えず、レイアウト制約に限定 |
| データ保全 | セッション、Profile、モデルキャッシュ、資格情報のマスキング | 全後続カード、最終確認はオーケストレーター | S3aでは削除操作をせず、保存値や秘密値を記録しない |

### 最終実施マトリクス

「未実施」は「未再現」と明記する。S3aで行ったdesktop DOM確認以外の列は、後続カードで実施するまで未実施である。担当カードがない対象外は理由を併記する。

| 主要操作（画面） | 担当カード / 監査担当 | desktop | 360px | keyboard（初期focus/Tab/Shift+Tab） | AX/DOM | 既存データ保全の証拠 |
|---|---|---|---|---|---|---|
| 開始: 検索 / 手動入力 / 開始 | `model-search`, `start-form-a11y` / オーケストレーター | S3a E-01〜E-03（現状課題を再現） | 未実施（未再現）—`responsive-actions`へ | 未実施（未再現）—`start-form-a11y`へ | E-01〜E-03（AX/DOM結論） | D-01: セッション/Profile/キャッシュ/マスク表示を維持 |
| API設定: モデル更新 / 編集 / 削除 | `settings-feedback` / オーケストレーター | E-04/E-05（失敗・複数Profileは未再現） | 未実施（未再現）—`responsive-actions`へ | 未実施（未再現）—`settings-feedback`へ | E-04/E-05（AX/DOM、未再現） | D-01、削除操作なし |
| プロンプト設定: 複製 / 編集 / 削除 / 保存 | `settings-feedback` / オーケストレーター | E-06（削除は未再現） | 未実施（未再現）—`responsive-actions`へ | 未実施（未再現）—`settings-feedback`へ | E-06（AX/DOM、未再現） | D-01、built-in以外の削除なし |
| セッション: 履歴 / 追加ラウンド / 削除 | `session-handoff-feedback`, `responsive-actions` / オーケストレーター | E-09（desktop操作列のみ） | 未実施（未再現）—`responsive-actions`へ | 未実施（未再現）—後続カードへ | E-09（DOM、狭幅未実施） | D-01、削除操作なし |
| Grill: 回答 / 中断 / 再試行 / 追加ラウンド | `session-handoff-feedback`, `responsive-actions` / オーケストレーター | E-07（未検出のみ再現） | 未実施（未再現）—`responsive-actions`へ | 未実施（未再現）—後続カードへ | E-07（state/AX結論） | D-01、既存セッションを維持 |
| Handoff: コピー / fallback / Markdown保存 | `session-handoff-feedback`, `responsive-actions` / オーケストレーター | E-08（失敗は未再現） | 未実施（未再現）—`responsive-actions`へ | 未実施（未再現）—後続カードへ | E-08（DOM/state、未再現） | D-01、既存成果物を維持 |

ブラウザ再現済みとした行は E-01、E-02、E-03、E-07 の4行だけであり、それぞれ一つのS3a証拠行に一対一で対応する。E-04〜E-06、E-08〜E-09は未再現または未実施のまま扱い、症状の存在を断定しない。

変更パス: `docs/ui-ux-audit.md`

概要: Issue #42の6画面、9候補、モデル検索7要件、主要操作・フォーム・フィードバック・狭幅・AX/DOM・既存データ保全を、S3aのredacted browser evidenceとソース確認を区別して棚卸しし、後続カードと最終実施マトリクスへ割り当てた。
