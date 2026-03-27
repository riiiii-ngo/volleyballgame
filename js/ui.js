/**
 * ui.js
 * 画面のDOM更新を専門に担当するファイル。
 *
 * 役割：
 *   - 状態（state.js）を読み取ってDOMに反映する
 *   - 選手カード・カレンダー・トレーニングカード・成長画面を描画する
 *   - 試合画面のスコアバー・フェーズUI・コマンドボタンを更新する
 *   - リザルト画面のグレード・統計・報酬を描画する
 *
 * 設計方針：
 *   - すべての関数は「描画するだけ」に専念する（状態の変更は行わない）
 *   - screens.js・match.js から呼ばれることを想定している
 *   - Godot移植時は各 UI ノードのスクリプトに相当
 */

// =============================================================
// トップバー（メイン育成画面）
// =============================================================

/**
 * メイン画面のトップバー（選手名・進行状況・ファン・資金）を更新する。
 */
function uiUpdateTopbar() {
  const state    = getState();
  const progress = getProgressInfo();

  document.getElementById("main-player-name").textContent   = state.player.name;
  document.getElementById("main-position").textContent      = state.player.position;
  document.getElementById("main-progress-text").textContent = progress.progressText;
  document.getElementById("main-fans").textContent          = `👥 ${state.fans.toLocaleString()}`;
  document.getElementById("main-money").textContent         = formatMoney(state.money);
}

// =============================================================
// 選手カード（左カラム）
// =============================================================

/**
 * 選手カードの全要素（ポジションバッジ・能力値バー・コンディション・戦績）を更新する。
 */
function uiRenderPlayerCard() {
  const state = getState();

  // ポジションバッジ
  const posMap = {
    エース: "ACE", セッター: "SET", リベロ: "LIB",
    ミドル: "MID", オポジット: "OPP", ウイング: "WNG",
  };
  document.getElementById("card-position-badge").textContent =
    posMap[state.player.position] || state.player.position;

  // 能力値バー
  _renderCardStats();

  // コンディション（疲労・GP）
  _renderCardCondition();

  // 戦績
  _renderCardRecord();
}

/**
 * 選手カードの能力値バーを描画する内部関数。
 * プレー能力値（スパイク・レシーブ・サーブ・ブロック・トス）を表示する。
 */
function _renderCardStats() {
  const state     = getState();
  const container = document.getElementById("card-stats");
  container.innerHTML = "";

  // カードに表示する能力値（主要6つに絞る）
  const displayKeys = ["spike", "receive", "serve", "block", "toss", "technique"];

  displayKeys.forEach((key) => {
    const def = STAT_DEFINITIONS.find((d) => d.key === key);
    if (!def) return;

    const value      = state.stats[key] || 0;
    const barPercent = (value / GAME_CONFIG.STAT_MAX) * 100;

    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `
      <span class="stat-label">${def.label}</span>
      <div class="stat-bar-bg">
        <div class="stat-bar-fill" style="width:${barPercent.toFixed(1)}%;"></div>
      </div>
      <span class="stat-val">${value}</span>
    `;
    container.appendChild(row);
  });
}

/**
 * 選手カードのコンディション（疲労バー・GP）を更新する内部関数。
 */
function _renderCardCondition() {
  const state = getState();

  // 疲労バー幅
  const fatigueBar = document.getElementById("card-fatigue-bar");
  if (fatigueBar) {
    fatigueBar.style.width = `${state.fatigue}%`;
  }

  // 疲労ラベル文字
  const fatigueStatus = getFatigueStatus(state.fatigue);
  const fatigueVal    = document.getElementById("card-fatigue-val");
  if (fatigueVal) {
    fatigueVal.textContent = fatigueStatus.label;
    fatigueVal.style.color = fatigueStatus.color;
  }

  // GP表示
  const gpEl = document.getElementById("card-gp");
  if (gpEl) {
    gpEl.textContent = `${state.growthPoints} GP`;
  }
}

/**
 * 選手カードの戦績エリアを更新する内部関数。
 */
function _renderCardRecord() {
  const r         = getState().record;
  const container = document.getElementById("card-record");
  if (!container) return;

  container.innerHTML = `
    <div class="record-line">
      <span>通算</span>
      <span class="record-val">${r.totalWins}勝 ${r.totalLosses}敗</span>
    </div>
    <div class="record-line">
      <span>MVP</span>
      <span class="record-val">${r.mvpCount}回</span>
    </div>
    <div class="record-line">
      <span>全国優勝</span>
      <span class="record-val">${r.nationalCupWins}回</span>
    </div>
  `;
}

// =============================================================
// 次の試合予告パネル
// =============================================================

/**
 * 「次の試合」パネルを更新する。
 */
function uiUpdateNextMatchPanel() {
  const nextMatch = getNextMatchEvent();
  const el        = document.getElementById("next-match-info");
  if (!el) return;

  if (nextMatch) {
    const reward = MATCH_REWARDS[nextMatch.matchType];
    el.innerHTML =
      `<strong>${nextMatch.label}</strong><br>` +
      `${nextMatch.year}年目 ${nextMatch.month}月 第${nextMatch.week}週` +
      `　賞金: <span style="color:#60e080;">${formatMoney(reward?.prizeMoney ?? 0)}</span>`;
  } else {
    el.textContent = "試合なし";
  }
}

// =============================================================
// 月間カレンダー
// =============================================================

/**
 * 月間カレンダー（4週分）を描画する。
 * 現在週・過去週・試合週を色分けして表示する。
 */
function uiRenderCalendar() {
  const calendar  = getMonthCalendar();
  const container = document.getElementById("main-calendar");
  if (!container) return;
  container.innerHTML = "";

  calendar.forEach((week) => {
    const cell = document.createElement("div");
    cell.className = "cal-week";

    if (week.isCurrent) cell.classList.add("current");
    if (week.isPast)    cell.classList.add("done");
    if (week.hasMatch)  cell.classList.add("match-week");

    // ラベルと試合アイコン
    const labelDiv = document.createElement("div");
    labelDiv.className   = "cal-week-label";
    labelDiv.textContent = `第${week.week}週`;

    const eventDiv = document.createElement("div");
    eventDiv.className   = "cal-week-event";
    eventDiv.textContent = week.hasMatch ? _shortMatchLabel(week.matchType) : "";

    cell.appendChild(labelDiv);
    cell.appendChild(eventDiv);
    container.appendChild(cell);
  });
}

// =============================================================
// アクションメニュー・試合ボタン有効制御
// =============================================================

/**
 * メインメニューの「試合へ」ボタンの有効/無効を、
 * 現在週に試合があるかどうかで切り替える。
 */
function uiUpdateMatchButton() {
  const state = getState();
  const btn   = document.getElementById("btn-go-match");
  if (!btn) return;

  btn.disabled = !state.currentScheduledMatch;
}

/**
 * 今週の行動完了通知を表示/非表示する。
 *
 * @param {boolean} show - true で表示
 */
function uiShowActionDoneNotice(show) {
  const el = document.getElementById("action-done-notice");
  if (el) el.style.display = show ? "block" : "none";
}

// =============================================================
// トレーニング画面
// =============================================================

/**
 * トレーニング画面のヘッダー情報（疲労・資金）を更新する。
 */
function uiUpdateTrainingHeader() {
  const state = getState();

  const fatigueStatus = getFatigueStatus(state.fatigue);
  const labelEl = document.getElementById("training-fatigue-label");
  const valEl   = document.getElementById("training-fatigue-val");

  if (labelEl) {
    labelEl.textContent = fatigueStatus.label;
    labelEl.style.color = fatigueStatus.color;
  }
  if (valEl) {
    valEl.textContent = state.fatigue;
  }

  const moneyEl = document.getElementById("training-money");
  if (moneyEl) moneyEl.textContent = formatMoney(state.money);
}

/**
 * トレーニング選択画面のカード一覧を描画する。
 */
function uiRenderTrainingCards() {
  const items     = getTrainingMenuItems();
  const container = document.getElementById("training-card-list");
  if (!container) return;
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "training-card";

    if (!item.canDo) card.classList.add("disabled");

    // GP表示テキスト
    const gpText = item.gpMax === 0
      ? "疲労回復"
      : `+${item.gpMin}〜${item.gpMax} GP`;

    // コスト表示テキスト
    const costText = item.cost === 0
      ? "費用：無料"
      : `費用：${formatMoney(item.cost)}`;

    // 疲労変化テキスト
    const fatigueText = item.fatigueChange < 0
      ? `疲労 ${item.fatigueChange}（回復）`
      : `疲労 +${item.fatigueChange}`;

    card.innerHTML = `
      <div class="tc-icon">${item.icon}</div>
      <div class="tc-name">${item.name}</div>
      <div class="tc-desc">${item.description.replace(/\n/g, "<br>")}</div>
      <div class="tc-cost">${costText}</div>
      <div class="tc-effect" style="color:${item.fatigueChange < 0 ? "#60e080" : "#ff9040"}">
        ${fatigueText}
      </div>
      <div class="tc-effect" style="color:${item.gpMax === 0 ? "#a0c4ff" : "#40ff80"}">
        ${gpText}
      </div>
      ${!item.canDo
        ? `<div style="font-size:10px; color:#ff6060; margin-top:2px;">${item.reason}</div>`
        : ""}
    `;

    // 実行可能な場合のみクリックイベントを登録する
    if (item.canDo) {
      card.addEventListener("click", () => onTrainingCardClick(item.id));
    }

    container.appendChild(card);
  });
}

// =============================================================
// 成長ポイント振り分け画面
// =============================================================

/**
 * 成長ポイント振り分け画面の能力値リストをカテゴリごとに描画する。
 */
function uiRenderGrowthStats() {
  const state = getState();

  // GP残量表示を更新
  const gpEl = document.getElementById("growth-gp-remain");
  if (gpEl) gpEl.textContent = state.growthPoints;

  const categoryMap = {
    [STAT_CATEGORIES.BASIC]:    "growth-stats-basic",
    [STAT_CATEGORIES.PLAY]:     "growth-stats-play",
    [STAT_CATEGORIES.PHYSIQUE]: "growth-stats-physique",
  };

  Object.entries(categoryMap).forEach(([catKey, containerId]) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    const defs = STAT_DEFINITIONS.filter((d) => d.category === catKey);

    defs.forEach((def) => {
      const value   = state.stats[def.key];
      const isFixed = def.isFixed;

      // 必要GPを計算する
      const costEntry = GP_COST_TABLE.find((e) => value < e.thresholdBelow);
      const gpCost    = isFixed ? null : (costEntry ? costEntry.gpCost : 5);

      // バー幅を計算する（身長は実数換算）
      const barPercent = def.key === "height"
        ? Math.min(100, ((value - 150) / 60) * 100)
        : (value / GAME_CONFIG.STAT_MAX) * 100;

      const row = document.createElement("div");
      row.className       = "growth-stat-row";
      row.dataset.statKey = def.key;

      row.innerHTML = `
        <span class="gs-label">${def.label}</span>
        <div class="gs-bar-bg">
          <div class="gs-bar-fill" id="gs-bar-${def.key}" style="width:${barPercent.toFixed(1)}%;"></div>
        </div>
        <span class="gs-val" id="gs-val-${def.key}">${value}</span>
        <span class="gs-cost">${isFixed ? "固定" : `${gpCost}GP`}</span>
        ${isFixed
          ? `<span class="gs-fixed">変更不可</span>`
          : `<button class="gs-btn-up" id="gs-up-${def.key}" data-key="${def.key}">＋</button>`
        }
      `;

      container.appendChild(row);
    });
  });

  // ＋ボタンのイベントを一括登録する
  _attachGrowthButtons();
  uiRefreshGrowthButtons();
}

/**
 * 成長画面の ＋ボタンにクリックイベントを登録する内部関数。
 */
function _attachGrowthButtons() {
  document.querySelectorAll(".gs-btn-up").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key    = btn.dataset.key;
      const result = spendGPToUpgradeStat(key);
      if (result.success) {
        _refreshGrowthRow(key);
        const gpEl = document.getElementById("growth-gp-remain");
        if (gpEl) gpEl.textContent = getState().growthPoints;
        uiRefreshGrowthButtons();
      }
    });
  });
}

/**
 * 成長画面の1行分（バー・数値）を再描画する。
 *
 * @param {string} key - 更新する能力値キー
 */
function _refreshGrowthRow(key) {
  const state = getState();
  const value = state.stats[key];
  const def   = STAT_DEFINITIONS.find((d) => d.key === key);
  if (!def) return;

  const barPercent = def.key === "height"
    ? Math.min(100, ((value - 150) / 60) * 100)
    : (value / GAME_CONFIG.STAT_MAX) * 100;

  const barEl = document.getElementById(`gs-bar-${key}`);
  if (barEl) barEl.style.width = `${barPercent.toFixed(1)}%`;

  const valEl = document.getElementById(`gs-val-${key}`);
  if (valEl) valEl.textContent = value;
}

/**
 * GP残量に応じて ＋ ボタンの有効/無効を更新する。
 */
function uiRefreshGrowthButtons() {
  const state = getState();
  const gp    = state.growthPoints;

  STAT_DEFINITIONS.forEach((def) => {
    if (def.isFixed) return;

    const value     = state.stats[def.key];
    const costEntry = GP_COST_TABLE.find((e) => value < e.thresholdBelow);
    const cost      = costEntry ? costEntry.gpCost : 5;

    const btn = document.getElementById(`gs-up-${def.key}`);
    if (btn) {
      btn.disabled = gp < cost || value >= GAME_CONFIG.STAT_MAX;
    }
  });
}

// =============================================================
// 試合画面：スコアバー更新
// =============================================================

/**
 * 試合画面のスコアバーを更新する。
 * match.js の _addPoint から呼ばれる。
 *
 * @param {{ mySets, oppSets, myPts, oppPts, setNum }} score - 現在のスコア
 */
function updateScoreUI(score) {
  const el = {
    myPt    : document.getElementById("match-my-pt"),
    oppPt   : document.getElementById("match-opp-pt"),
    mySets  : document.getElementById("match-my-sets"),
    oppSets : document.getElementById("match-opp-sets"),
    setLabel: document.getElementById("match-set-label"),
  };

  if (el.myPt)     el.myPt.textContent     = score.myPts;
  if (el.oppPt)    el.oppPt.textContent    = score.oppPts;
  if (el.mySets)   el.mySets.textContent   = score.mySets;
  if (el.oppSets)  el.oppSets.textContent  = score.oppSets;
  if (el.setLabel) el.setLabel.textContent = `第${score.setNum}セット`;
}

/**
 * 試合開始時にスコアバーの選手名・相手名を設定する。
 *
 * @param {string} myName   - 自選手名
 * @param {string} oppName  - 相手チーム名
 */
function uiSetMatchNames(myName, oppName) {
  const myEl  = document.getElementById("match-my-name");
  const oppEl = document.getElementById("match-opp-name");
  if (myEl)  myEl.textContent  = myName;
  if (oppEl) oppEl.textContent = oppName;
}

// =============================================================
// 試合画面：フェーズUI（ステータスラベル・コマンドボタン）
// =============================================================

/**
 * フェーズが変わったときに呼ばれ、ステータスラベルとコマンドボタンを更新する。
 * match.js の _enterPhase から呼ばれる。
 *
 * @param {string} phase - MATCH_PHASE の値
 */
function updatePhaseUI(phase) {
  // フェーズ状態ラベルを更新する
  const phaseLabels = {
    [MATCH_PHASE.SERVE]:      "サーブ",
    [MATCH_PHASE.RECEIVE]:    "レシーブ",
    [MATCH_PHASE.SET]:        "トス（自動）",
    [MATCH_PHASE.ATTACK]:     "スパイク",
    [MATCH_PHASE.OPP_RETURN]: "相手の攻撃",
    [MATCH_PHASE.POINT]:      "ポイント",
  };

  const labelEl = document.getElementById("phase-status-label");
  if (labelEl) labelEl.textContent = phaseLabels[phase] || phase;

  // コマンドボタンを再描画する
  _renderCommandButtons(phase);
}

/**
 * フェーズに応じたコマンドボタンを描画する内部関数。
 * PHASE_COMMANDS にコマンドがないフェーズはボタン非表示。
 *
 * @param {string} phase
 */
function _renderCommandButtons(phase) {
  const container = document.getElementById("command-btns");
  if (!container) return;
  container.innerHTML = "";

  const commands = PHASE_COMMANDS[phase];
  if (!commands || commands.length === 0) {
    // コマンドなしフェーズ：自動進行中メッセージ
    const msg = document.createElement("div");
    msg.style.cssText = "color:#3a5070; font-size:11px; text-align:center; padding:8px; width:100%;";
    msg.textContent   = "自動進行中...";
    container.appendChild(msg);
    return;
  }

  commands.forEach((cmd) => {
    const btn = document.createElement("button");
    btn.className       = "cmd-btn";
    btn.dataset.cmdId   = cmd.id;
    btn.dataset.phase   = phase;
    btn.innerHTML       = `${cmd.label}<br><span style="font-size:9px; color:#5080a0;">${cmd.description}</span>`;

    btn.addEventListener("click", () => {
      executeCommand(cmd.id, phase);
    });

    container.appendChild(btn);
  });
}

/**
 * AUTO モードボタンの表示を切り替える。
 *
 * @param {boolean} isAuto - true ならAUT ON状態
 */
function uiUpdateAutoButton(isAuto) {
  const btn   = document.getElementById("btn-auto-toggle");
  const label = document.getElementById("auto-label");
  if (!btn || !label) return;

  label.textContent = isAuto ? "ON" : "OFF";

  if (isAuto) {
    btn.classList.add("active");
  } else {
    btn.classList.remove("active");
  }
}

// =============================================================
// 試合リザルト画面
// =============================================================

/**
 * 試合リザルト画面の全要素を描画する。
 * match.js の _endMatch から openResult 経由で呼ばれる。
 *
 * @param {Object} result - 試合結果オブジェクト
 * @param {boolean}  result.win         - 勝利したか
 * @param {Object}   result.opponent    - 対戦相手情報 { name }
 * @param {string}   result.scoreText   - セットスコア文字列（例: "2-1"）
 * @param {boolean}  result.mvp        - MVP獲得したか
 * @param {Object}   result.grade       - グレードオブジェクト { grade, color, message }
 * @param {Object}   result.rewards     - 報酬情報 { prizeMoney, gpBonus, consolation }
 * @param {Object}   result.matchStats  - プレー統計 { spikeAttempts, spikeSuccess, ... }
 */
function uiRenderResultScreen(result) {
  const { win, opponent, scoreText, mvp, grade, rewards, matchStats } = result;

  // --- グレード ---
  const gradeEl   = document.getElementById("result-grade");
  const gradeMsgEl = document.getElementById("result-grade-msg");
  if (gradeEl) {
    gradeEl.textContent  = grade.grade;
    gradeEl.style.color  = grade.color;
  }
  if (gradeMsgEl) gradeMsgEl.textContent = grade.message;

  // --- 勝敗バッジ・スコア ---
  const winBadge = document.getElementById("result-win-badge");
  if (winBadge) {
    winBadge.textContent  = win ? "勝利" : "敗北";
    winBadge.className    = `win-badge ${win ? "win" : "lose"}`;
  }

  const scoreEl = document.getElementById("result-score-text");
  if (scoreEl) scoreEl.textContent = scoreText;

  const vsEl = document.getElementById("result-vs-text");
  if (vsEl) vsEl.textContent = `vs. ${opponent.name}`;

  // --- プレー統計 ---
  const spikeRate = matchStats.spikeAttempts > 0
    ? Math.round(matchStats.spikeSuccess / matchStats.spikeAttempts * 100)
    : 0;
  const receiveRate = matchStats.receiveAttempts > 0
    ? Math.round(matchStats.receiveSuccess / matchStats.receiveAttempts * 100)
    : 0;

  const spikeRateEl   = document.getElementById("result-spike-rate");
  const receiveRateEl = document.getElementById("result-receive-rate");
  const contribEl     = document.getElementById("result-contrib");

  if (spikeRateEl)   spikeRateEl.textContent   = `${spikeRate}%`;
  if (receiveRateEl) receiveRateEl.textContent  = `${receiveRate}%`;
  if (contribEl)     contribEl.textContent      = `${matchStats.pointContrib}点`;

  // --- 報酬パネル ---
  const rewardsEl = document.getElementById("result-rewards-panel");
  if (rewardsEl) {
    rewardsEl.innerHTML = `
      <div class="reward-item">
        <div class="reward-label">獲得賞金</div>
        <div class="reward-val money">${formatMoney(win ? rewards.prizeMoney : rewards.consolation)}</div>
      </div>
      <div class="reward-item">
        <div class="reward-label">獲得GP</div>
        <div class="reward-val gp">+${rewards.gpBonus} GP</div>
      </div>
      <div class="reward-item">
        <div class="reward-label">ファン増加</div>
        <div class="reward-val fans">+${rewards.fanDelta ? rewards.fanDelta.toLocaleString() : 0}</div>
      </div>
    `;
  }

  // --- MVP バッジ ---
  const mvpEl = document.getElementById("mvp-badge");
  if (mvpEl) mvpEl.style.display = mvp ? "block" : "none";
}

// =============================================================
// エンディング画面
// =============================================================

/**
 * エンディング画面に3年間の成績まとめを描画する。
 */
function uiRenderEndingStats() {
  const state     = getState();
  const r         = state.record;
  const container = document.getElementById("ending-stats");
  if (!container) return;

  const totalStats = STAT_DEFINITIONS
    .filter((d) => !d.isFixed)
    .reduce((sum, d) => sum + state.stats[d.key], 0);

  container.innerHTML = `
    <div>通算成績：${r.totalWins}勝 ${r.totalLosses}敗</div>
    <div>MVP獲得：${r.mvpCount}回</div>
    <div>地方大会優勝：${r.localCupWins}回 / 全国大会優勝：${r.nationalCupWins}回 / 世界大会優勝：${r.worldCupWins}回</div>
    <div>最終能力値合計：${totalStats}　身長：${state.stats.height}cm</div>
    <div>最終所持金：${formatMoney(state.money)}</div>
  `;
}

// =============================================================
// 内部ユーティリティ
// =============================================================

/**
 * 試合種別から短い表示名を返す。カレンダーの狭いセルに表示するため短縮する。
 *
 * @param {string} matchType
 * @returns {string}
 */
function _shortMatchLabel(matchType) {
  const labels = {
    practice:        "練習",
    local_league:    "地方L",
    national_league: "全国L",
    local_cup:       "地方杯",
    national_cup:    "全国杯",
    world_cup:       "世界杯",
  };
  return labels[matchType] || "試合";
}
