/**
 * ui.js
 * 画面のDOM更新を専門に担当するファイル。
 *
 * 役割：
 *   - 状態（state.js）を読み取ってDOMに反映する
 *   - マップ画面（Canvas描画・ロケーションボタン）を管理する
 *   - 選手作成画面のポイント振り分けUIを制御する
 *   - 試合画面のスコアバー・フェーズUI・コマンドボタンを更新する
 *   - エージェント画面の移籍情報を描画する
 *   - リザルト・成長・トレーニング画面のDOM更新
 *
 * 設計方針：
 *   - すべての関数は「描画するだけ」に専念する（状態の変更は行わない）
 *   - Godot移植時は各 UI ノードのスクリプトに相当
 */

// =============================================================
// マップ画面
// =============================================================

/**
 * マップ画面のトップバーを更新する。
 */
function uiUpdateMapTopbar() {
  const state    = getState();
  const progress = getProgressInfo();

  _setText("map-player-name",   state.player.name);
  _setText("map-position",      state.player.position);
  _setText("map-team-name",     state.career.teamName);
  _setText("map-progress-text", progress.progressText);
  _setText("map-evaluation",    `評価 ${state.career.evaluation}`);
  _setText("map-money",         _formatMoney(state.money));
}

/**
 * マップ Canvas を描画し、ロケーションボタンを生成する。
 * 画面を開くたびに1回呼ぶ。
 */
function uiRenderMap() {
  _drawMapCanvas();
  _renderLocationButtons();
}

/**
 * マップ背景を Canvas に描画する内部関数。
 * 街並みを簡易的に表現する。
 */
function _drawMapCanvas() {
  const canvas = document.getElementById("map-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = 800, H = 510;

  // --- 背景（夜の街）---
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0,   "#04080f");
  skyGrad.addColorStop(0.5, "#070c1c");
  skyGrad.addColorStop(1,   "#0a1228");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // --- 星 ---
  ctx.fillStyle = "rgba(200,220,255,0.6)";
  const stars = [[80,40],[200,25],[350,55],[500,20],[650,45],[720,30],[140,80],[420,70],[580,60],[750,85]];
  stars.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- 遠景ビル群 ---
  ctx.fillStyle = "#0c1428";
  [[50,280,40,120],[110,260,30,140],[160,290,50,110],[240,250,35,130],
   [310,270,45,120],[380,245,30,145],[450,275,50,115],[530,260,35,130],
   [600,285,40,105],[660,255,30,135],[710,280,45,110],[760,265,30,125]]
    .forEach(([x, y, w, h]) => ctx.fillRect(x, y, w, h));

  // ビルの窓（点滅感）
  ctx.fillStyle = "rgba(255,240,160,0.3)";
  for (let i = 0; i < 40; i++) {
    const bx = 50 + (i * 37) % 700;
    const by = 258 + (i * 13) % 100;
    if ((i * 7 + 3) % 5 !== 0) ctx.fillRect(bx, by, 4, 5);
  }

  // --- 道路（石畳風） ---
  const roadGrad = ctx.createLinearGradient(0, 360, 0, H);
  roadGrad.addColorStop(0, "#0c1426");
  roadGrad.addColorStop(1, "#080e1c");
  ctx.fillStyle = roadGrad;
  ctx.fillRect(0, 360, W, H - 360);

  // 道路の区画線
  ctx.strokeStyle = "rgba(30,60,120,0.4)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 360);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 390);
  ctx.lineTo(W, 390);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 440);
  ctx.lineTo(W, 440);
  ctx.stroke();

  // --- 建物の輪郭ライン ---
  ctx.strokeStyle = "rgba(20,50,130,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 360);
  ctx.lineTo(W, 360);
  ctx.stroke();

  // --- ロケーション名のアクセント光 ---
  MAP_LOCATIONS.forEach((loc) => {
    const glow = ctx.createRadialGradient(loc.x, loc.y, 0, loc.x, loc.y, 55);
    glow.addColorStop(0, "rgba(30,80,200,0.15)");
    glow.addColorStop(1, "rgba(30,80,200,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(loc.x, loc.y, 55, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * マップ上のロケーションボタンを生成する内部関数。
 * 各ロケーションのCanvas座標に absolute 配置する。
 */
function _renderLocationButtons() {
  const container = document.getElementById("map-location-btns");
  if (!container) return;
  container.innerHTML = "";

  const locStatus = getMapLocationStatus();

  MAP_LOCATIONS.forEach((loc) => {
    const status = locStatus[loc.id] || { available: true, reason: null };

    const btn = document.createElement("button");
    btn.className  = "map-loc-btn";
    btn.dataset.locId = loc.id;
    btn.style.left = `${loc.x}px`;
    btn.style.top  = `${loc.y}px`;

    if (!status.available) btn.classList.add("locked");

    btn.innerHTML = `
      <span class="map-loc-icon">${loc.icon}</span>
      <span class="map-loc-label">${loc.label}</span>
    `;

    btn.addEventListener("click", () => onMapLocationClick(loc.id, status));
    container.appendChild(btn);
  });
}

/**
 * マップポップアップを開く。
 * ロケーションボタンクリック時に main.js から呼ばれる。
 *
 * @param {string} locId - MAP_LOCATIONS の id
 * @param {{ available: boolean, reason: string|null }} status
 */
function uiOpenMapPopup(locId) {
  const loc    = MAP_LOCATIONS.find((l) => l.id === locId);
  const status = getMapLocationStatus()[locId] || { available: true, reason: null };
  if (!loc) return;

  _setText("popup-icon",  loc.icon);
  _setText("popup-title", loc.label);
  _setText("popup-desc",  loc.desc);

  // ポップアップアクションを生成する
  const actionsEl = document.getElementById("popup-actions");
  actionsEl.innerHTML = "";

  const actions = _getLocationActions(locId, status);
  actions.forEach((action) => {
    const btn = document.createElement("button");
    btn.className = "popup-action-btn" + (action.primary ? " primary-action" : "");
    btn.disabled  = action.disabled || false;
    btn.innerHTML = `<span>${action.icon}</span><span>${action.label}</span>`;
    if (action.note) {
      const noteEl = document.createElement("div");
      noteEl.className   = "popup-action-note";
      noteEl.textContent = action.note;
    }
    btn.addEventListener("click", () => {
      uiCloseMapPopup();
      action.handler();
    });
    actionsEl.appendChild(btn);
  });

  document.getElementById("map-popup").style.display = "block";
}

/**
 * マップポップアップを閉じる。
 */
function uiCloseMapPopup() {
  const popup = document.getElementById("map-popup");
  if (popup) popup.style.display = "none";
}

/**
 * ロケーションごとのアクション定義を返す内部関数。
 *
 * @param {string} locId
 * @param {{ available: boolean, reason: string|null }} status
 * @returns {Array<{ icon, label, primary, disabled, handler }>}
 */
function _getLocationActions(locId, status) {
  const state = getState();

  switch (locId) {
    case "home":
      return [
        {
          icon: "😴", label: "休息（疲労回復）",
          primary: false, disabled: false,
          handler: () => onHomeRest(),
        },
        {
          icon: "💾", label: "セーブ",
          primary: false, disabled: false,
          handler: () => onSave(),
        },
      ];

    case "gym": {
      const locked = state.career.trainedThisMatch;
      return [
        {
          icon: "🏋️", label: locked ? "トレーニング（次の試合後まで不可）" : "トレーニング",
          primary: !locked, disabled: locked,
          handler: () => openTraining(),
        },
        {
          icon: "📈", label: "成長ポイント振り分け",
          primary: false, disabled: false,
          handler: () => openGrowth(),
        },
      ];
    }

    case "stadium": {
      const nextMatch = getNextMatch();
      const canPlay   = canPlayNextMatch();
      return [
        {
          icon: "🏆",
          label: canPlay ? `試合へ：${nextMatch.label}` : "試合の予定なし",
          primary: canPlay, disabled: !canPlay,
          handler: () => {
            if (canPlay) openMatch(nextMatch.matchType, nextMatch.label);
          },
        },
      ];
    }

    case "agent":
      return [
        {
          icon: "🏢", label: "エージェントに会う",
          primary: true, disabled: false,
          handler: () => openAgent(),
        },
      ];

    case "shop":
      return [
        {
          icon: "🏪", label: "近日公開",
          primary: false, disabled: true,
          handler: () => {},
        },
      ];

    default:
      return [];
  }
}

// =============================================================
// 選手作成画面：ポイント振り分けUI
// =============================================================

/**
 * 選手作成画面のポイント振り分けUIを初期化する。
 * openCreate() から呼ばれる。
 */
function uiInitCreateStats() {
  // 残りポイントを初期値にリセットする
  _createPointsRemain = GAME_CONFIG.CREATE_POINTS;
  _createAllocated    = {};

  // 各能力値の初期値をセットする
  STAT_DEFINITIONS.forEach((def) => {
    _createAllocated[def.key] = 0;
  });

  _setText("create-points-remain", _createPointsRemain);

  // 基礎能力・プレー能力のボタン行を生成する
  _renderCreateStatRows("create-stats-basic", STAT_CATEGORIES.BASIC);
  _renderCreateStatRows("create-stats-play",  STAT_CATEGORIES.PLAY);

  // 身長スライダーのイベントを設定する
  const slider = document.getElementById("slider-height");
  if (slider) {
    slider.value = 175;
    _setText("display-height", "175 cm");
    slider.addEventListener("input", () => {
      _setText("display-height", `${slider.value} cm`);
    });
  }
}

/** 振り分け中の残りポイント（モジュール内変数） */
let _createPointsRemain = GAME_CONFIG.CREATE_POINTS;
/** 振り分け済みの各能力値の増加量 */
let _createAllocated = {};

/**
 * 指定カテゴリの能力値振り分け行を生成する内部関数。
 *
 * @param {string} containerId
 * @param {string} category - STAT_CATEGORIES の値
 */
function _renderCreateStatRows(containerId, category) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  const defs = STAT_DEFINITIONS.filter((d) => d.category === category);

  defs.forEach((def) => {
    const currentVal = def.initial + (_createAllocated[def.key] || 0);

    const row = document.createElement("div");
    row.className = "create-stat-row";
    row.id        = `create-row-${def.key}`;

    row.innerHTML = `
      <span class="create-stat-name">${def.label}</span>
      <div class="create-stat-controls">
        <button class="create-stat-btn" id="cs-minus-${def.key}"
                data-key="${def.key}" data-dir="-1">－</button>
        <span class="create-stat-val" id="cs-val-${def.key}">${currentVal}</span>
        <button class="create-stat-btn" id="cs-plus-${def.key}"
                data-key="${def.key}" data-dir="1">＋</button>
      </div>
    `;

    container.appendChild(row);
  });

  // ＋／－ボタンのイベントを登録する
  container.querySelectorAll(".create-stat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const dir = parseInt(btn.dataset.dir, 10);
      _onCreateStatChange(key, dir);
    });
  });

  _refreshCreateStatButtons();
}

/**
 * ＋／－ボタンクリック時の処理。
 *
 * @param {string} key - 能力値キー
 * @param {number} dir - +1 or -1
 */
function _onCreateStatChange(key, dir) {
  const alloc   = _createAllocated[key] || 0;
  const def     = STAT_DEFINITIONS.find((d) => d.key === key);
  const current = def.initial + alloc;

  if (dir > 0) {
    // ポイントが残っているか・上限に達していないか確認する
    if (_createPointsRemain <= 0) return;
    if (current >= GAME_CONFIG.STAT_MAX) return;
    _createAllocated[key]  = alloc + 1;
    _createPointsRemain--;
  } else {
    // 0未満には下げられない
    if (alloc <= 0) return;
    _createAllocated[key]  = alloc - 1;
    _createPointsRemain++;
  }

  // 表示を更新する
  const valEl = document.getElementById(`cs-val-${key}`);
  if (valEl) valEl.textContent = def.initial + _createAllocated[key];
  _setText("create-points-remain", _createPointsRemain);
  _refreshCreateStatButtons();
}

/**
 * ＋／－ボタンの有効/無効を更新する。
 */
function _refreshCreateStatButtons() {
  STAT_DEFINITIONS.forEach((def) => {
    if (def.category === STAT_CATEGORIES.PHYSIQUE) return;

    const alloc   = _createAllocated[def.key] || 0;
    const current = def.initial + alloc;

    const plusBtn  = document.getElementById(`cs-plus-${def.key}`);
    const minusBtn = document.getElementById(`cs-minus-${def.key}`);

    if (plusBtn)  plusBtn.disabled  = _createPointsRemain <= 0 || current >= GAME_CONFIG.STAT_MAX;
    if (minusBtn) minusBtn.disabled = alloc <= 0;
  });
}

/**
 * 作成画面で確定したステータスを返す。
 * main.js の onStartGame() から呼ばれる。
 *
 * @returns {Object} { key: value, ... }
 */
function uiGetCreateStats() {
  const result = {};
  const heightSlider = document.getElementById("slider-height");

  STAT_DEFINITIONS.forEach((def) => {
    if (def.key === "height") {
      result[def.key] = heightSlider ? parseInt(heightSlider.value, 10) : def.initial;
    } else {
      result[def.key] = def.initial + (_createAllocated[def.key] || 0);
    }
  });
  return result;
}

// =============================================================
// トレーニング画面
// =============================================================

/**
 * トレーニング画面のヘッダー（疲労・資金）を更新する。
 */
function uiUpdateTrainingHeader() {
  const state         = getState();
  const fatigueStatus = getFatigueStatus(state.fatigue);

  const lbl  = document.getElementById("training-fatigue-label");
  const lbl2 = document.getElementById("training-fatigue-label2");
  const val  = document.getElementById("training-fatigue-val");
  const mon  = document.getElementById("training-money");

  if (lbl)  { lbl.textContent  = fatigueStatus.label; lbl.style.color  = fatigueStatus.color; }
  if (lbl2) { lbl2.textContent = fatigueStatus.label; lbl2.style.color = fatigueStatus.color; }
  if (val)  val.textContent  = state.fatigue;
  if (mon)  mon.textContent  = _formatMoney(state.money);
}

/**
 * トレーニングカード一覧を描画する。
 */
function uiRenderTrainingCards() {
  const items     = getTrainingMenuItems();
  const container = document.getElementById("training-card-list");
  if (!container) return;
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "training-card" + (item.canDo ? "" : " disabled");

    const gpText      = item.gpMax === 0 ? "疲労回復" : `+${item.gpMin}〜${item.gpMax} GP`;
    const fatigueText = item.fatigueChange < 0
      ? `疲労 ${item.fatigueChange}（回復）`
      : `疲労 +${item.fatigueChange}`;
    const fatigueColor = item.fatigueChange < 0 ? "#50d080" : "#ff8840";

    card.innerHTML = `
      <div class="tc-icon">${item.icon}</div>
      <div class="tc-name">${item.name}</div>
      <div class="tc-desc">${item.description.replace(/\n/g, "<br>")}</div>
      <div class="tc-effect" style="color:${fatigueColor}">${fatigueText}</div>
      <div class="tc-effect" style="color:${item.gpMax === 0 ? "#7090c0" : "#50d080"}">${gpText}</div>
      ${!item.canDo
        ? `<div style="font-size:10px;color:#e04040;margin-top:2px;">${item.reason}</div>`
        : ""}
    `;

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
 * 成長ポイント振り分け画面の能力値リストを描画する。
 */
function uiRenderGrowthStats() {
  const state = getState();
  _setText("growth-gp-remain", state.growthPoints);

  const categoryMap = {
    [STAT_CATEGORIES.BASIC]:    "growth-stats-basic",
    [STAT_CATEGORIES.PLAY]:     "growth-stats-play",
    [STAT_CATEGORIES.PHYSIQUE]: "growth-stats-physique",
  };

  Object.entries(categoryMap).forEach(([catKey, containerId]) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    STAT_DEFINITIONS.filter((d) => d.category === catKey).forEach((def) => {
      const value   = state.stats[def.key];
      const isFixed = def.isFixed;
      const costEntry = GP_COST_TABLE.find((e) => value < e.thresholdBelow);
      const gpCost    = isFixed ? null : (costEntry ? costEntry.gpCost : 5);
      const barPct    = def.key === "height"
        ? Math.min(100, ((value - 150) / 60) * 100)
        : (value / GAME_CONFIG.STAT_MAX) * 100;

      const row = document.createElement("div");
      row.className       = "growth-stat-row";
      row.dataset.statKey = def.key;
      row.innerHTML = `
        <span class="gs-label">${def.label}</span>
        <div class="gs-bar-bg">
          <div class="gs-bar-fill" id="gs-bar-${def.key}" style="width:${barPct.toFixed(1)}%;"></div>
        </div>
        <span class="gs-val" id="gs-val-${def.key}">${value}</span>
        <span class="gs-cost">${isFixed ? "固定" : `${gpCost}GP`}</span>
        ${isFixed
          ? `<span class="gs-fixed">変更不可</span>`
          : `<button class="gs-btn-up" id="gs-up-${def.key}" data-key="${def.key}">＋</button>`}
      `;
      container.appendChild(row);
    });
  });

  _attachGrowthButtons();
  uiRefreshGrowthButtons();
}

/**
 * 成長画面の ＋ ボタンにイベントを登録する内部関数。
 */
function _attachGrowthButtons() {
  document.querySelectorAll(".gs-btn-up").forEach((btn) => {
    btn.addEventListener("click", () => {
      const result = spendGPToUpgradeStat(btn.dataset.key);
      if (result.success) {
        _refreshGrowthRow(btn.dataset.key);
        _setText("growth-gp-remain", getState().growthPoints);
        uiRefreshGrowthButtons();
      }
    });
  });
}

/**
 * 成長画面の1行（バー・数値）を部分更新する。
 * @param {string} key
 */
function _refreshGrowthRow(key) {
  const value = getState().stats[key];
  const def   = STAT_DEFINITIONS.find((d) => d.key === key);
  if (!def) return;

  const barPct = def.key === "height"
    ? Math.min(100, ((value - 150) / 60) * 100)
    : (value / GAME_CONFIG.STAT_MAX) * 100;

  const barEl = document.getElementById(`gs-bar-${key}`);
  const valEl = document.getElementById(`gs-val-${key}`);
  if (barEl) barEl.style.width = `${barPct.toFixed(1)}%`;
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
    const btn       = document.getElementById(`gs-up-${def.key}`);
    if (btn) btn.disabled = gp < cost || value >= GAME_CONFIG.STAT_MAX;
  });
}

// =============================================================
// エージェント（移籍）画面
// =============================================================

/**
 * エージェント画面を全描画する。
 * openAgent() から呼ばれる。
 */
function uiRenderAgentScreen() {
  const state = getState();
  _setText("agent-evaluation", `評価 ${state.career.evaluation}`);

  _renderAgentCurrentTeam();
  _renderAgentOffers();
  _renderAgentRequestTargets();
}

/**
 * 現在のチーム情報を描画する内部関数。
 */
function _renderAgentCurrentTeam() {
  const state     = getState();
  const container = document.getElementById("agent-current-team");
  if (!container) return;

  const team = TEAM_TABLE.find((t) => t.id === state.career.teamId);
  if (!team) return;

  container.innerHTML = `
    <div class="agent-current-team-card">
      <span class="agent-team-tier">Tier ${team.tier}</span>
      <div class="agent-team-info">
        <div class="agent-team-name">${team.name}</div>
        <div class="agent-team-salary">月給: ${_formatMoney(team.salary)}</div>
      </div>
    </div>
  `;
}

/**
 * 移籍オファー一覧を描画する内部関数。
 */
function _renderAgentOffers() {
  const container = document.getElementById("agent-offers");
  if (!container) return;

  const offers = getTransferOffers();
  if (offers.length === 0) {
    container.innerHTML = `<div class="agent-no-items">現在オファーはありません</div>`;
    return;
  }

  container.innerHTML = "";
  offers.forEach((offer) => {
    const team = TEAM_TABLE.find((t) => t.id === offer.teamId);
    if (!team) return;

    const card = document.createElement("div");
    card.className = "agent-offer-card highlight";
    card.innerHTML = `
      <span class="offer-tier-badge">Tier ${team.tier}</span>
      <div class="offer-info">
        <div class="offer-team-name">${team.name}</div>
        <div class="offer-salary">月給: ${_formatMoney(team.salary)}</div>
        <div class="offer-expires">期限: あと${offer.expiresAfterMatch - getState().career.matchIndex}試合</div>
      </div>
      <button class="btn-accept-offer" data-team-id="${team.id}">承諾</button>
    `;
    container.appendChild(card);
  });

  // 承諾ボタンのイベントを登録する
  container.querySelectorAll(".btn-accept-offer").forEach((btn) => {
    btn.addEventListener("click", () => {
      onAcceptTransferOffer(btn.dataset.teamId);
    });
  });
}

/**
 * 移籍申請ターゲット一覧を描画する内部関数。
 */
function _renderAgentRequestTargets() {
  const container = document.getElementById("agent-request-targets");
  if (!container) return;

  const targets = getTransferRequestTargets();
  if (targets.length === 0) {
    container.innerHTML = `<div class="agent-no-items">最高ティアに所属中です</div>`;
    return;
  }

  container.innerHTML = "";
  targets.forEach(({ team, threshold, canRequest }) => {
    const row = document.createElement("div");
    row.className = "agent-request-row";
    row.innerHTML = `
      <span class="req-tier">Tier ${team.tier}</span>
      <span class="req-team">${team.name}</span>
      <span class="req-threshold">評価 ${threshold} 必要</span>
      <button class="btn-request-transfer" data-team-id="${team.id}"
              ${canRequest ? "" : "disabled"}>申請</button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll(".btn-request-transfer").forEach((btn) => {
    btn.addEventListener("click", () => {
      onRequestTransfer(btn.dataset.teamId);
    });
  });
}

// =============================================================
// 試合画面：スコアバー・フェーズUI
// =============================================================

/**
 * 試合スコアバーを更新する。
 * match.js の _addPoint から呼ばれる。
 *
 * @param {{ mySets, oppSets, myPts, oppPts, setNum }} score
 */
function updateScoreUI(score) {
  _setText("match-my-pt",    score.myPts);
  _setText("match-opp-pt",   score.oppPts);
  _setText("match-my-sets",  score.mySets);
  _setText("match-opp-sets", score.oppSets);
  _setText("match-set-label", `第${score.setNum}セット`);
}

/**
 * スコアバーの選手名・相手名を設定する。
 * @param {string} myName
 * @param {string} oppName
 */
function uiSetMatchNames(myName, oppName) {
  _setText("match-my-name",  myName);
  _setText("match-opp-name", oppName);
}

/**
 * フェーズが変わったときに呼ばれ、ステータスラベルとコマンドボタンを更新する。
 * match.js の _enterPhase から呼ばれる。
 *
 * @param {string} phase - MATCH_PHASE の値
 */
function updatePhaseUI(phase) {
  const phaseLabels = {
    [MATCH_PHASE.SERVE]:      "🏐 サーブ",
    [MATCH_PHASE.RECEIVE]:    "↔️ レシーブ",
    [MATCH_PHASE.TOSS]:       "⚙️ トス（自動）",
    [MATCH_PHASE.SPIKE]:      "💥 スパイク",
    [MATCH_PHASE.BLOCK]:      "🛡️ ブロック",
    [MATCH_PHASE.AUTO_RALLY]: "▶️ ラリー中...",
    [MATCH_PHASE.POINT]:      "✅ ポイント",
  };

  _setText("phase-status-label", phaseLabels[phase] || phase);
  _renderCommandButtons(phase);

  // 移動ボタンの強調：RECEIVE/BLOCK フェーズのみ有効感を出す
  const moveActive = phase === MATCH_PHASE.RECEIVE || phase === MATCH_PHASE.BLOCK;
  document.getElementById("btn-move-left") ?.classList.toggle("move-active", moveActive);
  document.getElementById("btn-move-right")?.classList.toggle("move-active", moveActive);
}

/**
 * フェーズに応じたコマンドボタンを描画する内部関数。
 *
 * @param {string} phase
 */
function _renderCommandButtons(phase) {
  const container = document.getElementById("command-btns");
  if (!container) return;
  container.innerHTML = "";

  const commands = PHASE_COMMANDS[phase];

  // コマンドなしフェーズ：自動進行中メッセージ
  if (!commands || commands.length === 0) {
    const msg = document.createElement("div");
    msg.style.cssText =
      "color:#2a3c58;font-size:11px;text-align:center;padding:8px;width:100%;grid-column:span 2;";
    msg.textContent = "自動進行中...";
    container.appendChild(msg);
    return;
  }

  // フェーズ別のボタンカラークラス
  const phaseClass = {
    [MATCH_PHASE.SERVE]:   "phase-serve",
    [MATCH_PHASE.RECEIVE]: "phase-receive",
    [MATCH_PHASE.SPIKE]:   "phase-spike",
    [MATCH_PHASE.BLOCK]:   "phase-block",
  }[phase] || "";

  commands.forEach((cmd) => {
    const btn = document.createElement("button");
    btn.className     = `cmd-btn ${phaseClass}`;
    btn.dataset.cmdId = cmd.id;
    btn.dataset.phase = phase;
    btn.innerHTML     = `${cmd.label}<br>
      <span style="font-size:9px;color:inherit;opacity:0.65;">${cmd.description}</span>`;

    btn.addEventListener("click", () => executeCommand(cmd.id, phase));
    container.appendChild(btn);
  });
}

/**
 * AUTO モードボタンの表示を切り替える。
 * @param {boolean} isAuto
 */
function uiUpdateAutoButton(isAuto) {
  const btn   = document.getElementById("btn-auto-toggle");
  const label = document.getElementById("auto-label");
  if (label) label.textContent = isAuto ? "ON" : "OFF";
  if (btn)   btn.classList.toggle("active", isAuto);
}

// =============================================================
// 試合リザルト画面
// =============================================================

/**
 * 試合リザルト画面の全要素を描画する。
 * screens.js の openResult から呼ばれる。
 *
 * @param {Object} result
 */
function uiRenderResultScreen(result) {
  const { win, opponent, scoreText, mvp, grade, rewards, matchStats, evalGain, newOffers } = result;

  // グレード
  const gradeEl    = document.getElementById("result-grade");
  const gradeMsgEl = document.getElementById("result-grade-msg");
  if (gradeEl)    { gradeEl.textContent = grade.grade; gradeEl.style.color = grade.color; }
  if (gradeMsgEl)   gradeMsgEl.textContent = grade.message;

  // 勝敗バッジ・スコア
  const winBadge = document.getElementById("result-win-badge");
  if (winBadge) { winBadge.textContent = win ? "勝利" : "敗北"; winBadge.className = `win-badge ${win ? "win" : "lose"}`; }
  _setText("result-score-text", scoreText);
  _setText("result-vs-text",    `vs. ${opponent.name}`);

  // プレー統計
  const ms = matchStats;
  _setText("result-spike-rate",   _rateStr(ms.spikeSuccess,   ms.spikeAttempts));
  _setText("result-receive-rate", _rateStr(ms.receiveSuccess, ms.receiveAttempts));
  _setText("result-block-rate",   _rateStr(ms.blockSuccess,   ms.blockAttempts));
  _setText("result-contrib",      `${ms.pointContrib}点`);

  // 評価値獲得
  _setText("result-eval-val", `+${evalGain}`);

  // 報酬パネル
  const rewardsEl = document.getElementById("result-rewards-panel");
  if (rewardsEl) {
    rewardsEl.innerHTML = `
      <div class="reward-item">
        <div class="reward-label">賞金</div>
        <div class="reward-val money">${_formatMoney(rewards.prizeMoney)}</div>
      </div>
      <div class="reward-item">
        <div class="reward-label">月給</div>
        <div class="reward-val salary">${_formatMoney(rewards.salary)}</div>
      </div>
      <div class="reward-item">
        <div class="reward-label">獲得GP</div>
        <div class="reward-val gp">+${rewards.gpBonus} GP</div>
      </div>
    `;
  }

  // MVP バッジ
  const mvpEl = document.getElementById("mvp-badge");
  if (mvpEl) mvpEl.style.display = mvp ? "block" : "none";

  // 移籍オファー通知
  const offerNotice = document.getElementById("result-offer-notice");
  if (offerNotice) offerNotice.style.display = (newOffers && newOffers.length > 0) ? "block" : "none";
}

// =============================================================
// エンディング画面
// =============================================================

/**
 * エンディング画面に成績まとめを描画する。
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
    <div>所属チーム：${state.career.teamName}（Tier ${state.career.teamTier}）</div>
    <div>通算成績：${r.totalWins}勝 ${r.totalLosses}敗</div>
    <div>MVP獲得：${r.mvpCount}回</div>
    <div>地方大会優勝：${r.localCupWins}回 / 全国大会優勝：${r.nationalCupWins}回 / 世界大会優勝：${r.worldCupWins}回</div>
    <div>最終能力値合計：${totalStats}　身長：${state.stats.height}cm</div>
    <div>最終評価値：${state.career.evaluation}　所持金：${_formatMoney(state.money)}</div>
  `;
}

// =============================================================
// 内部ユーティリティ
// =============================================================

/**
 * 指定IDの要素のテキストを設定する。
 * @param {string} id
 * @param {string|number} text
 */
function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * 成功数/試行数から "xx%" 文字列を返す。
 * @param {number} success
 * @param {number} attempts
 * @returns {string}
 */
function _rateStr(success, attempts) {
  if (!attempts) return "--%";
  return `${Math.round(success / attempts * 100)}%`;
}

/**
 * 金額を日本円形式でフォーマットする。
 * @param {number} amount
 * @returns {string}
 */
function _formatMoney(amount) {
  if (amount == null) return "¥0";
  return `¥${amount.toLocaleString()}`;
}
