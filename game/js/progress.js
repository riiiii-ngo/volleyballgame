/**
 * progress.js
 * ゲーム全体の進行を管理するファイル。
 *
 * 役割：
 *   - 週・月・年の進行を制御する
 *   - ANNUAL_SCHEDULE を参照して試合イベントを発火する
 *   - 月末の生活費徴収を行う
 *   - ゲームオーバー・エンディングの判定と遷移を行う
 *
 * 設計方針：
 *   - 各処理の結果を「イベントオブジェクト」として返す
 *   - 実際の画面遷移は screens.js に任せる
 *   - Godot移植時は ProgressManager.gd / GameLoop.gd に相当
 */

// =============================================================
// 週を進める（メイン進行関数）
// =============================================================

/**
 * 1週間を進める。
 * 行動後に呼ばれ、時間経過・月末処理・試合判定を順に行う。
 *
 * @returns {{
 *   events        : Array<Object>,  // この週に発生したイベントのリスト
 *   isGameOver    : boolean,        // ゲームオーバーになったか
 *   isEnding      : boolean,        // エンディングに到達したか
 *   endingId      : string|null,    // 到達したエンディングのID
 *   scheduledMatch: Object|null,    // 今週の試合イベント（あれば）
 * }}
 */
function advanceToNextWeek() {
  const events = []; // この週に発生したイベントを記録する

  // --- 1週間分、時間を進める ---
  const { monthChanged, yearChanged } = advanceWeek();

  // --- 月が変わった場合の処理 ---
  if (monthChanged) {
    const monthEvent = _processMonthEnd(yearChanged);
    events.push(...monthEvent.events);

    // 生活費が払えなかった場合はゲームオーバー
    if (monthEvent.isGameOver) {
      return {
        events,
        isGameOver: true,
        isEnding: false,
        endingId: null,
        scheduledMatch: null,
      };
    }

    // 年が変わった場合の処理
    if (yearChanged) {
      const yearEvent = _processYearEnd();
      events.push(...yearEvent.events);

      // 3年終了でエンディングへ
      if (yearEvent.isEnding) {
        const endingId = _determineEnding();
        triggerEnding();
        return {
          events,
          isGameOver: false,
          isEnding: true,
          endingId,
          scheduledMatch: null,
        };
      }
    }
  }

  // --- 今週の試合スケジュールを確認する ---
  const scheduledMatch = _checkScheduledMatch();
  if (scheduledMatch) {
    setScheduledMatch(scheduledMatch);
    events.push({
      type: "match_notice",
      label: scheduledMatch.label,
      matchType: scheduledMatch.matchType,
    });
  } else {
    setScheduledMatch(null);
  }

  return {
    events,
    isGameOver: false,
    isEnding: false,
    endingId: null,
    scheduledMatch,
  };
}

// =============================================================
// 月末処理
// =============================================================

/**
 * 月末の処理をまとめて行う内部関数。
 * 生活費の徴収のみ。（試合スケジュールは週次チェックで対応）
 *
 * @param {boolean} isYearEnd - 年末でもあるかどうか
 * @returns {{ events: Array<Object>, isGameOver: boolean }}
 */
function _processMonthEnd(isYearEnd) {
  const events = [];

  // --- 毎月の生活費を徴収する ---
  const costResult = payMonthlyCost();
  events.push({
    type: "monthly_cost",
    paid: costResult.paid,
    isGameOver: costResult.isGameOver,
  });

  if (costResult.isGameOver) {
    return { events, isGameOver: true };
  }

  return { events, isGameOver: false };
}

// =============================================================
// 年末処理
// =============================================================

/**
 * 年末の処理をまとめて行う内部関数。
 * 3年目終了でエンディングフラグを立てる。
 *
 * @returns {{ events: Array<Object>, isEnding: boolean }}
 */
function _processYearEnd() {
  const events = [];
  const state = getState();

  events.push({
    type: "year_end",
    year: state.year - 1, // advanceWeek() で既に年が加算されているため -1
  });

  // 規定年数を超えたらエンディング
  // ※ advanceWeek() で year が加算済みなので、TOTAL_YEARS + 1 で判定する
  if (state.year > GAME_CONFIG.TOTAL_YEARS) {
    return { events, isEnding: true };
  }

  return { events, isEnding: false };
}

// =============================================================
// 試合スケジュールの確認
// =============================================================

/**
 * 現在の年・月・週に対応する試合イベントを ANNUAL_SCHEDULE から探す。
 *
 * @returns {Object|null} 該当する試合イベント、なければ null
 */
function _checkScheduledMatch() {
  const state = getState();

  const match = ANNUAL_SCHEDULE.find(
    (event) =>
      event.type === "match" &&
      event.year  === state.year &&
      event.month === state.month &&
      event.week  === state.week
  );

  return match || null;
}

// =============================================================
// エンディング判定
// =============================================================

/**
 * 3年間の結果からエンディングを決定する。
 * ENDINGS テーブルを priority 順にチェックし、最初に条件を満たしたものを返す。
 *
 * @returns {string} エンディングID（ENDINGS の id）
 */
function _determineEnding() {
  const state = getState();
  const record = state.record;

  // priority の昇順（小さいほど優先）でソートしてチェック
  const sorted = [...ENDINGS].sort((a, b) => a.priority - b.priority);

  for (const ending of sorted) {
    if (ending.condition(record)) {
      return ending.id;
    }
  }

  // どれにも該当しない場合はデフォルト（通常ありえないが安全のため）
  return "journeyman";
}

// =============================================================
// 現在の進行状況の取得（UI表示用）
// =============================================================

/**
 * 現在の進行状況をまとめたオブジェクトを返す。
 * ヘッダーやスケジュール表示に使う。
 *
 * @returns {{
 *   yearLabel    : string,  // "1年目" のような表示文字列
 *   monthLabel   : string,  // "4月" のような表示文字列
 *   weekLabel    : string,  // "第2週" のような表示文字列
 *   progressText : string,  // "1年目 4月 第2週" のような1行テキスト
 *   weeksLeft    : number,  // ゲーム終了まで残り何週か
 *   thisMonthSchedule: Array<Object>, // 今月の試合スケジュール
 * }}
 */
function getProgressInfo() {
  const state = getState();

  const yearLabel  = `${state.year}年目`;
  const monthLabel = `${state.month}月`;
  const weekLabel  = `第${state.week}週`;
  const progressText = `${yearLabel} ${monthLabel} ${weekLabel}`;

  // 残り週数の計算
  const totalWeeks =
    GAME_CONFIG.TOTAL_YEARS *
    GAME_CONFIG.MONTHS_PER_YEAR *
    GAME_CONFIG.WEEKS_PER_MONTH;
  const currentWeek =
    (state.year - 1) * GAME_CONFIG.MONTHS_PER_YEAR * GAME_CONFIG.WEEKS_PER_MONTH +
    (state.month - 1) * GAME_CONFIG.WEEKS_PER_MONTH +
    state.week;
  const weeksLeft = totalWeeks - currentWeek;

  // 今月の試合スケジュールを取得する
  const thisMonthSchedule = ANNUAL_SCHEDULE.filter(
    (e) => e.type === "match" && e.year === state.year && e.month === state.month
  );

  return {
    yearLabel,
    monthLabel,
    weekLabel,
    progressText,
    weeksLeft,
    thisMonthSchedule,
  };
}

/**
 * 今月・今週のスケジュールを4週分の配列で返す。
 * カレンダー表示に使う。
 *
 * @returns {Array<{ week: number, hasMatch: boolean, matchLabel: string|null, isCurrent: boolean, isPast: boolean }>}
 */
function getMonthCalendar() {
  const state = getState();

  return [1, 2, 3, 4].map((w) => {
    // 今月の試合がこの週にあるか確認する
    const matchEvent = ANNUAL_SCHEDULE.find(
      (e) =>
        e.type  === "match" &&
        e.year  === state.year &&
        e.month === state.month &&
        e.week  === w
    );

    return {
      week:       w,
      hasMatch:   !!matchEvent,
      matchLabel: matchEvent ? matchEvent.label : null,
      matchType:  matchEvent ? matchEvent.matchType : null,
      isCurrent:  w === state.week,
      isPast:     w < state.week,
    };
  });
}

/**
 * 次に来る試合イベントを探して返す。
 * メイン画面の「次の試合」表示に使う。
 *
 * @returns {Object|null} 次の試合イベント、なければ null
 */
function getNextMatchEvent() {
  const state = getState();

  // 現在位置以降のスケジュールを時系列順に探す
  const upcoming = ANNUAL_SCHEDULE
    .filter((e) => {
      if (e.type !== "match") return false;
      if (e.year > state.year) return true;
      if (e.year < state.year) return false;
      if (e.month > state.month) return true;
      if (e.month < state.month) return false;
      return e.week >= state.week;
    })
    .sort((a, b) => {
      // 年→月→週の順で昇順ソート
      if (a.year  !== b.year)  return a.year  - b.year;
      if (a.month !== b.month) return a.month - b.month;
      return a.week - b.week;
    });

  return upcoming.length > 0 ? upcoming[0] : null;
}
