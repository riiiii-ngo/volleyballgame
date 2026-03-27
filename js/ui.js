/**
 * ui.js
 * 画面のDOM更新を専門に担当するファイル。
 *
 * 役割：
 *   - 状態（state.js）を読み取ってDOMに反映する
 *   - 能力値バー・カレンダー・ログ・カードなどを描画する
 *   - ゲームロジックは一切持たない
 *
 * 設計方針：
 *   - すべての関数は「描画するだけ」に専念する
 *   - 状態の変更は行わない（読み取り専用）
 *   - screens.js から呼ばれることを想定している
 *   - Godot移植時は各 UI ノードのスクリプトに相当
 */

// =============================================================
// ヘッダーの更新
// =============================================================

/**
 * メイン画面のヘッダー（選手名・進行状況・資金）を更新する。
 */
function uiUpdateHeader() {
  const state    = getState();
  const progress = getProgressInfo();

  document.getElementById("main-player-name").textContent    = state.player.name;
  document.getElementById("main-progress-text").textContent  = progress.progressText;
  document.getElementById("main-money").textContent          = formatMoney(state.money);
}

// =============================================================
// 月間カレンダーの描画
// =============================================================

/**
 * 月間カレンダー（4週分）を描画する。
 * 現在週・過去週・試合週を色分けして表示する。
 */
function uiRenderCalendar() {
  const calendar = getMonthCalendar();      // progress.js から今月の4週分データを取得
  const nextMatch = getNextMatchEvent();     // 次の試合予告を取得
  const container = document.getElementById("main-calendar");
  container.innerHTML = "";

  calendar.forEach((week) => {
    const cell = document.createElement("div");
    cell.className = "week-cell";

    // 現在週・過去週・試合週でスタイルを変える
    if (week.isCurrent)   cell.classList.add("current");
    if (week.isPast)      cell.classList.add("done");
    if (week.hasMatch)    cell.classList.add("match-week");

    // セルの中身：第N週 + 試合名（あれば）
    const label = week.hasMatch
      ? `第${week.week}週<br><span style="font-size:10px;">${_shortMatchLabel(week.matchType)}</span>`
      : `第${week.week}週`;

    cell.innerHTML = label;
    container.appendChild(cell);
  });

  // 次の試合予告メッセージを更新する
  const noticeEl = document.getElementById("next-match-notice");
  if (nextMatch) {
    const reward = MATCH_REWARDS[nextMatch.matchType];
    noticeEl.textContent =
      `次の試合：${nextMatch.label}（${nextMatch.year}年目${nextMatch.month}月 第${nextMatch.week}週）` +
      `　賞金: ${formatMoney(reward?.prizeMoney ?? 0)}`;
  } else {
    noticeEl.textContent = "これ以上の試合スケジュールはありません。";
  }
}

// =============================================================
// 能力値バーの描画（メイン画面）
// =============================================================

/**
 * メイン画面の能力値バーリストを描画する。
 * STAT_DEFINITIONS の順序で全能力値を表示する。
 */
function uiRenderStatBars() {
  const state     = getState();
  const container = document.getElementById("main-stats-list");
  container.innerHTML = "";

  // カテゴリごとにグループ化して表示する
  const categories = [
    { key: STAT_CATEGORIES.BASIC,    label: "基礎", barClass: "basic"    },
    { key: STAT_CATEGORIES.PLAY,     label: "プレー", barClass: "play"   },
    { key: STAT_CATEGORIES.PHYSIQUE, label: "体格", barClass: "physique" },
  ];

  categories.forEach(({ key, label, barClass }) => {
    // カテゴリ見出し
    const catEl = document.createElement("div");
    catEl.className = "stat-category-label";
    catEl.textContent = label;
    container.appendChild(catEl);

    // このカテゴリに属する能力値を1行ずつ描画する
    const defs = STAT_DEFINITIONS.filter((d) => d.category === key);
    defs.forEach((def) => {
      const value = state.stats[def.key];

      // 身長は100段階ではなく実数値なので、バーの長さを調整する
      const barPercent = def.key === "height"
        ? Math.min(100, ((value - 150) / 60) * 100) // 150〜210cmを0〜100%に換算
        : (value / GAME_CONFIG.STAT_MAX) * 100;

      const row = document.createElement("div");
      row.className = "stat-row";
      row.innerHTML = `
        <span class="stat-name">${def.label}</span>
        <div class="stat-bar-bg">
          <div class="stat-bar-fill ${barClass}" style="width:${barPercent.toFixed(1)}%;"></div>
        </div>
        <span class="stat-value">${value}</span>
      `;
      container.appendChild(row);
    });
  });
}

// =============================================================
// 状態パネルの更新（メイン画面）
// =============================================================

/**
 * 疲労度・GP・対戦成績を更新する。
 */
function uiUpdateStatusPanel() {
  const state = getState();

  // --- 疲労度 ---
  const fatigueStatus = getFatigueStatus(state.fatigue);
  document.getElementById("main-fatigue-text").textContent  = fatigueStatus.label;
  document.getElementById("main-fatigue-text").style.color  = fatigueStatus.color;

  // 疲労度バーの幅と色を設定する
  const fatigueBar = document.getElementById("main-fatigue-bar");
  fatigueBar.style.width      = `${state.fatigue}%`;
  fatigueBar.style.background = _fatiguBarGradient(state.fatigue);

  // --- 成長ポイント ---
  document.getElementById("main-gp").textContent = `${state.growthPoints} GP`;

  // --- 対戦成績 ---
  const r = state.record;
  const recordEl = document.getElementById("main-record");
  recordEl.innerHTML = `
    <div class="record-row">
      <span>通算成績</span>
      <span>${r.totalWins}勝 ${r.totalLosses}敗</span>
    </div>
    <div class="record-row">
      <span>MVP回数</span>
      <span>${r.mvpCount}回</span>
    </div>
    <div class="record-row">
      <span>地方大会優勝</span>
      <span>${r.localCupWins}回</span>
    </div>
    <div class="record-row">
      <span>全国大会優勝</span>
      <span>${r.nationalCupWins}回</span>
    </div>
    <div class="record-row">
      <span>世界大会優勝</span>
      <span>${r.worldCupWins}回</span>
    </div>
  `;
}

// =============================================================
// トレーニングカードの描画
// =============================================================

/**
 * トレーニング選択画面のカード一覧を描画する。
 * 実行可否に応じてカードの見た目を変える。
 */
function uiRenderTrainingCards() {
  const items     = getTrainingMenuItems(); // training.js からメニュー情報を取得
  const container = document.getElementById("training-card-list");
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "training-card";

    // 実行不可の場合はグレーアウト表示にする
    if (!item.canDo) {
      card.classList.add("disabled");
      card.style.opacity  = "0.45";
      card.style.cursor   = "not-allowed";
    }

    // GP表示テキスト（休息はGP0なので「回復」と表示）
    const gpText = item.gpMax === 0
      ? "疲労回復"
      : `+${item.gpMin}〜${item.gpMax} GP`;

    // コスト表示テキスト（無料なら「無料」と表示）
    const costText = item.cost === 0
      ? "費用：無料"
      : `費用：${formatMoney(item.cost)}`;

    // 疲労変化テキスト（マイナスなら回復）
    const fatigueText = item.fatigueChange < 0
      ? `疲労：${item.fatigueChange}（回復）`
      : `疲労：+${item.fatigueChange}`;

    card.innerHTML = `
      <span class="card-icon">${item.icon}</span>
      <span class="card-name">${item.name}</span>
      <span class="card-desc">${item.description.replace(/\n/g, "<br>")}</span>
      <span class="card-cost">${costText}</span>
      <span class="card-fatigue" style="color:${item.fatigueChange < 0 ? "#40ff80" : "#ff9040"}">
        ${fatigueText}
      </span>
      <span class="card-gain" style="color:${item.gpMax === 0 ? "#a0c4ff" : "#40ff80"}">
        ${gpText}
      </span>
      ${!item.canDo ? `<span style="font-size:11px; color:#ff6060;">${item.reason}</span>` : ""}
    `;

    // 実行可能な場合のみクリックイベントを登録する
    if (item.canDo) {
      card.addEventListener("click", () => onTrainingCardClick(item.id));
    }

    container.appendChild(card);
  });
}

// =============================================================
// 成長ポイント振り分け画面の描画
// =============================================================

/**
 * 成長ポイント振り分け画面の能力値リストを描画する。
 * カテゴリごとに +/- ボタン付きで表示する。
 */
function uiRenderGrowthStats() {
  const state = getState();

  const categoryMap = {
    [STAT_CATEGORIES.BASIC]:    { containerId: "growth-stats-basic",    barClass: "basic"    },
    [STAT_CATEGORIES.PLAY]:     { containerId: "growth-stats-play",     barClass: "play"     },
    [STAT_CATEGORIES.PHYSIQUE]: { containerId: "growth-stats-physique", barClass: "physique" },
  };

  Object.entries(categoryMap).forEach(([catKey, { containerId, barClass }]) => {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    const defs = STAT_DEFINITIONS.filter((d) => d.category === catKey);

    defs.forEach((def) => {
      const value      = state.stats[def.key];
      const isFixed    = def.isFixed;

      // 現在値に応じた必要GPを計算する
      const costEntry  = GP_COST_TABLE.find((e) => value < e.thresholdBelow);
      const gpCost     = isFixed ? "-" : (costEntry ? costEntry.gpCost : 5);

      // バーの幅を計算する（身長は実数換算）
      const barPercent = def.key === "height"
        ? Math.min(100, ((value - 150) / 60) * 100)
        : (value / GAME_CONFIG.STAT_MAX) * 100;

      // 1行分のHTML要素を作成する
      const row = document.createElement("div");
      row.className = "growth-stat-row";
      row.dataset.statKey = def.key; // クリック処理で使うためキーを保存する

      row.innerHTML = `
        <span class="growth-stat-name">${def.label}</span>
        <div class="growth-bar-bg">
          <div class="growth-bar-fill ${barClass}" style="width:${barPercent.toFixed(1)}%;"></div>
        </div>
        <span class="growth-stat-val" id="growth-val-${def.key}">${value}</span>
        <span class="growth-stat-cost">${isFixed ? "固定" : `${gpCost}GP/pt`}</span>
        ${isFixed
          ? `<div style="width:64px;"></div>` // 固定値はボタンなし
          : `
            <button class="growth-btn" id="growth-plus-${def.key}" data-key="${def.key}">＋</button>
            <button class="growth-btn" id="growth-minus-${def.key}" data-key="${def.key}">－</button>
          `
        }
      `;

      container.appendChild(row);
    });
  });

  // +/- ボタンのイベントを登録する（描画後に一括登録）
  _attachGrowthButtons();

  // GP残量に応じてボタンの有効/無効を更新する
  uiRefreshGrowthButtons();
}

/**
 * 成長画面の +/- ボタンのクリックイベントを登録する内部関数。
 */
function _attachGrowthButtons() {
  // + ボタン：能力値を1上げる
  document.querySelectorAll(".growth-btn[id^='growth-plus-']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key    = btn.dataset.key;
      const result = spendGPToUpgradeStat(key); // state.js の関数を呼ぶ
      if (result.success) {
        uiRefreshGrowthRow(key);               // この行だけ再描画する
        document.getElementById("growth-gp-remain").textContent = getState().growthPoints;
        uiRefreshGrowthButtons();              // ボタン有効/無効を再判定する
      }
    });
  });

  // - ボタン：現時点では「確認用」として現在のコストを表示するだけ
  // （能力値を下げる機能は仕様書に記載なし。今後の拡張用に残す）
  document.querySelectorAll(".growth-btn[id^='growth-minus-']").forEach((btn) => {
    btn.disabled = true; // 現在は無効
  });
}

/**
 * 成長画面の1行分（バー・値・ボタン）を再描画する。
 * +ボタン押下後に呼ばれ、その行だけ更新する（全体再描画を避けるため）。
 *
 * @param {string} key - 更新する能力値キー
 */
function uiRefreshGrowthRow(key) {
  const state = getState();
  const value = state.stats[key];
  const def   = STAT_DEFINITIONS.find((d) => d.key === key);
  if (!def) return;

  // バーの幅を更新する
  const barPercent = def.key === "height"
    ? Math.min(100, ((value - 150) / 60) * 100)
    : (value / GAME_CONFIG.STAT_MAX) * 100;

  const row = document.querySelector(`.growth-stat-row[data-stat-key="${key}"]`);
  if (row) {
    const bar = row.querySelector(".growth-bar-fill");
    if (bar) bar.style.width = `${barPercent.toFixed(1)}%`;
  }

  // 数値表示を更新する
  const valEl = document.getElementById(`growth-val-${key}`);
  if (valEl) valEl.textContent = value;
}

/**
 * GP残量に応じて成長画面の + ボタンの有効/無効を更新する。
 * GP不足で上げられない場合はボタンを無効にする。
 */
function uiRefreshGrowthButtons() {
  const state = getState();
  const gp    = state.growthPoints;

  STAT_DEFINITIONS.forEach((def) => {
    if (def.isFixed) return;

    const value     = state.stats[def.key];
    const costEntry = GP_COST_TABLE.find((e) => value < e.thresholdBelow);
    const cost      = costEntry ? costEntry.gpCost : 5;

    const plusBtn = document.getElementById(`growth-plus-${def.key}`);
    if (plusBtn) {
      // GPが足りない、または上限に達している場合は無効にする
      plusBtn.disabled = gp < cost || value >= GAME_CONFIG.STAT_MAX;
    }
  });
}

// =============================================================
// 試合ログの追加
// =============================================================

/**
 * 試合ログエリアに1件のエントリを追加する。
 *
 * @param {string}  text    - 表示するテキスト
 * @param {string}  cssClass - 追加するCSSクラス（"score-my" / "score-opp" / "set-result"）
 */
function uiAddMatchLog(text, cssClass = "") {
  const logEl = document.getElementById("match-log");
  const entry = document.createElement("div");
  entry.className = `log-entry ${cssClass}`;
  entry.textContent = text;
  logEl.appendChild(entry);

  // 常に最新ログが見えるようにスクロールする
  logEl.scrollTop = logEl.scrollHeight;
}

/**
 * 試合画面のスコアを更新する。
 *
 * @param {number} myScore  - 自チームの現在得点
 * @param {number} oppScore - 相手チームの現在得点
 */
function uiUpdateMatchScore(myScore, oppScore) {
  document.getElementById("match-my-score").textContent  = myScore;
  document.getElementById("match-opp-score").textContent = oppScore;
}

/**
 * セット終了時にセットスコアバッジを追加する。
 *
 * @param {number}  setNum  - セット番号（1〜3）
 * @param {boolean} myWon   - 自チームがセットを取ったか
 * @param {number}  myScore - セットの自チーム得点
 * @param {number}  oppScore- セットの相手得点
 */
function uiAddSetBadge(setNum, myWon, myScore, oppScore) {
  const container = document.getElementById("match-set-scores");
  const badge = document.createElement("div");
  badge.className = `set-badge ${myWon ? "won" : "lost"}`;
  badge.textContent = `${setNum}set: ${myScore}-${oppScore}`;
  container.appendChild(badge);
}

/**
 * 試合終了後に「結果へ」ボタンを表示し、「試合中...」メッセージを隠す。
 */
function uiShowMatchResultButton() {
  document.getElementById("btn-match-result").style.display      = "block";
  document.getElementById("match-in-progress-msg").style.display = "none";
}

// =============================================================
// 試合結果報酬の描画
// =============================================================

/**
 * 試合結果画面の報酬情報を描画する。
 *
 * @param {Object} matchResult  - simulateMatch() の戻り値
 * @param {Object} rewardResult - grantMatchReward() の戻り値
 */
function uiRenderRewards(matchResult, rewardResult) {
  const container = document.getElementById("result-rewards");
  const state     = getState();

  const rows = [];

  if (matchResult.win) {
    // 勝利時：賞金と GP を表示する
    rows.push({ label: "獲得賞金",       value: formatMoney(rewardResult.prizeMoney), cls: "reward-val" });
    rows.push({ label: "獲得GP",         value: `+${rewardResult.gpBonus} GP`,        cls: "gp-val" });
    if (matchResult.mvp) {
      rows.push({ label: "MVP",           value: "🏅 獲得！",                          cls: "reward-val" });
    }
  } else {
    // 敗北時：慰労金とGPを表示する
    rows.push({ label: "参加費（慰労）", value: formatMoney(rewardResult.consolation), cls: "reward-val" });
    rows.push({ label: "獲得GP（経験）",  value: `+${rewardResult.gpBonus} GP`,        cls: "gp-val" });
  }

  // 現在の所持金を表示する
  rows.push({ label: "現在の所持金",    value: formatMoney(state.money),              cls: "reward-val" });

  // HTML を生成して挿入する
  container.innerHTML = rows
    .map(
      (r) => `
      <div class="result-reward-item">
        <span>${r.label}</span>
        <span class="${r.cls}">${r.value}</span>
      </div>`
    )
    .join("");
}

// =============================================================
// エンディング画面の成績まとめ描画
// =============================================================

/**
 * エンディング画面に3年間の成績まとめを描画する。
 */
function uiRenderEndingStats() {
  const state     = getState();
  const r         = state.record;
  const container = document.getElementById("ending-stats");

  // 最終能力値の合計を計算する（体格除く）
  const totalStats = STAT_DEFINITIONS
    .filter((d) => !d.isFixed)
    .reduce((sum, d) => sum + state.stats[d.key], 0);

  container.innerHTML = `
    <div>通算成績：${r.totalWins}勝 ${r.totalLosses}敗</div>
    <div>MVP獲得：${r.mvpCount}回</div>
    <div>地方大会優勝：${r.localCupWins}回　全国大会優勝：${r.nationalCupWins}回　世界大会優勝：${r.worldCupWins}回</div>
    <div>最終能力値合計：${totalStats}　身長：${state.stats.height}cm</div>
    <div>最終所持金：${formatMoney(state.money)}</div>
  `;
}

// =============================================================
// 内部ユーティリティ
// =============================================================

/**
 * 試合種別から短い表示名を返す。
 * カレンダーの狭いセルに表示するために短縮する。
 *
 * @param {string} matchType - MATCH_REWARDS のキー
 * @returns {string} 短い表示名
 */
function _shortMatchLabel(matchType) {
  const labels = {
    practice:        "練習試合",
    local_league:    "地方L",
    national_league: "全国L",
    local_cup:       "地方大会",
    national_cup:    "全国大会",
    world_cup:       "世界大会",
  };
  return labels[matchType] || "試合";
}

/**
 * 疲労度に応じた疲労バーのグラデーションを返す。
 *
 * @param {number} fatigue - 現在の疲労度（0〜100）
 * @returns {string} CSSグラデーション文字列
 */
function _fatiguBarGradient(fatigue) {
  if (fatigue <= 40) return "linear-gradient(90deg, #1a8040, #3aba60)"; // 緑：良好
  if (fatigue <= 70) return "linear-gradient(90deg, #8a6000, #ffd700)"; // 黄：注意
  return "linear-gradient(90deg, #8a2000, #ff6040)";                    // 赤：危険
}
