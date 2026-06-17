const SYMBOL = "MCL=F";
const INSTRUMENT_LABEL = "Micro WTI Crude Oil Daily";
const SCORE_VALUES = [-3, -2, -1, 0, 1, 2, 3];

const TYPE_META = {
  A: { label: "A", description: "합계 -5 이하 + 관성 증가 = 강한 음봉" },
  B: { label: "B", description: "합계 -5 이하 + 관성 감소 = 약한 음봉" },
  C: { label: "C", description: "합계 +5 이상 + 관성 증가 = 강한 양봉" },
  D: { label: "D", description: "합계 +5 이상 + 관성 감소 = 약한 양봉" },
  N: { label: "N", description: "중립 또는 혼합" },
};

const els = {
  scoreBoard: document.querySelector("#scoreBoard"),
  analyzeBtn: document.querySelector("#analyzeBtn"),
  dataStatus: document.querySelector("#dataStatus"),
  dataNote: document.querySelector("#dataNote"),
  confidenceBadge: document.querySelector("#confidenceBadge"),
  resultCard: document.querySelector("#resultCard"),
  meterFill: document.querySelector("#meterFill"),
  recordedProbability: document.querySelector("#recordedProbability"),
  resultTitle: document.querySelector("#resultTitle"),
  totalScore: document.querySelector("#totalScore"),
  inertiaState: document.querySelector("#inertiaState"),
  patternType: document.querySelector("#patternType"),
  samePatternTotal: document.querySelector("#samePatternTotal"),
  samePatternHits: document.querySelector("#samePatternHits"),
  samePatternRate: document.querySelector("#samePatternRate"),
  resultCopy: document.querySelector("#resultCopy"),
  typeStatsTable: document.querySelector("#typeStatsTable"),
  recentValidationTable: document.querySelector("#recentValidationTable"),
};

const state = {
  manualScores: [0, 0, 0, 0, 0],
  data: null,
};

const pct = (value, total) => (total ? `${((value / total) * 100).toFixed(1)}%` : "데이터 부족");
const scoreText = (scores) => scores.map((score) => (score > 0 ? `+${score}` : String(score))).join(", ");
const directionText = (direction) => (direction === "bullish" ? "양봉" : direction === "bearish" ? "음봉" : "중립");
const directionClass = (direction) => (direction === "bullish" ? "bullish" : direction === "bearish" ? "bearish" : "");

function setStatus(text) {
  els.dataStatus.textContent = text;
}

function compactDate(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function isNumber(value) {
  return Number.isFinite(value);
}

async function fetchDailyOhlc() {
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOL)}?range=max&interval=1d&events=history`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`${SYMBOL} 데이터 요청 실패 (${response.status})`);

  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  if (!quote || !timestamps.length) throw new Error(`${SYMBOL} 일봉 데이터가 비어 있습니다.`);

  return timestamps
    .map((timestamp, index) => ({
      date: compactDate(timestamp),
      open: quote.open[index],
      high: quote.high[index],
      low: quote.low[index],
      close: quote.close[index],
    }))
    .filter((row) => isNumber(row.open) && isNumber(row.high) && isNumber(row.low) && isNumber(row.close));
}

function scoreCandle(rows, index) {
  const body = Math.abs(rows[index].close - rows[index].open);
  const direction = rows[index].close > rows[index].open ? 1 : rows[index].close < rows[index].open ? -1 : 0;
  if (!direction) return 0;

  const previousBodies = rows.slice(index - 20, index).map((row) => Math.abs(row.close - row.open));
  const averageBody = previousBodies.reduce((sum, value) => sum + value, 0) / previousBodies.length;
  const ratio = averageBody > 0 ? body / averageBody : 0;
  const magnitude = ratio >= 1.5 ? 3 : ratio >= 0.7 ? 2 : 1;
  return direction * magnitude;
}

function buildScoredRows(rows) {
  return rows.slice(20).map((row, offset) => {
    const rawIndex = offset + 20;
    return { ...row, rawIndex, score: scoreCandle(rows, rawIndex) };
  });
}

function getInertia(scores, total) {
  if (Math.abs(total) < 5) return "혼합";

  const direction = Math.sign(total);
  const firstTwoPressure = Math.abs(scores[0] + scores[1]);
  const recentThreeSum = scores[2] + scores[3] + scores[4];
  const recentThreePressure = Math.abs(recentThreeSum);
  const recentThreeAligned = Math.sign(recentThreeSum) === direction;

  if (recentThreeAligned && recentThreePressure >= firstTwoPressure) return "관성 증가";
  return "관성 감소";
}

function classifyType(total, inertia) {
  if (total <= -5) return inertia === "관성 증가" ? "A" : "B";
  if (total >= 5) return inertia === "관성 증가" ? "C" : "D";
  return "N";
}

function getFinalDirection(total) {
  if (total >= 0) return "bullish";
  if (total < 0) return "bearish";
  return "bullish";
}

function getActualDirection(row) {
  if (row.close > row.open) return "bullish";
  if (row.close < row.open) return "bearish";
  return "neutral";
}

function buildValidation(rows) {
  const scored = buildScoredRows(rows);
  const validations = [];

  for (let index = 4; index < scored.length; index += 1) {
    const current = scored[index];
    const next = rows[current.rawIndex + 1];
    if (!next) continue;

    const scores = scored.slice(index - 4, index + 1).map((row) => row.score);
    const total = scores.reduce((sum, score) => sum + score, 0);
    const inertia = getInertia(scores, total);
    const type = classifyType(total, inertia);
    const prediction = getFinalDirection(total);
    const actual = getActualDirection(next);

    validations.push({
      date: current.date,
      scores,
      total,
      inertia,
      type,
      prediction,
      actual,
      hit: prediction !== "neutral" && actual !== "neutral" && prediction === actual,
      nextDate: next.date,
    });
  }

  return { rows, scored, validations };
}

function getManualAnalysis() {
  const scores = state.manualScores;
  const total = scores.reduce((sum, score) => sum + score, 0);
  const inertia = getInertia(scores, total);
  const type = classifyType(total, inertia);
  const prediction = getFinalDirection(total);
  return { scores, total, inertia, type, prediction };
}

function summarize(records) {
  const tradable = records.filter((record) => record.prediction !== "neutral" && record.actual !== "neutral");
  const hits = tradable.filter((record) => record.hit).length;
  const bullish = records.filter((record) => record.actual === "bullish").length;
  const bearish = records.filter((record) => record.actual === "bearish").length;
  return {
    total: records.length,
    tradable: tradable.length,
    hits,
    bullish,
    bearish,
    rate: tradable.length ? hits / tradable.length : 0,
  };
}

function getSameTypeStats(type) {
  if (!state.data) return summarize([]);
  return summarize(state.data.validations.filter((record) => record.type === type));
}

function getConfidence(stats, type) {
  let level = "LOW";
  if (stats.tradable >= 100) level = "HIGH";
  else if (stats.tradable >= 30) level = "MID";

  if ((type === "A" || type === "C") && stats.tradable >= 30 && level === "MID") {
    level = "HIGH";
  }

  return {
    label: level,
    className: level.toLowerCase(),
    width: level === "HIGH" ? 92 : level === "MID" ? 62 : 34,
  };
}

function buildScoreBoard() {
  els.scoreBoard.innerHTML = "";
  state.manualScores.forEach((score, dayIndex) => {
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `<span>D-${5 - dayIndex}</span>`;

    SCORE_VALUES.forEach((value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `score-btn ${value > 0 ? "positive" : value < 0 ? "negative" : "neutral"}`;
      button.dataset.day = String(dayIndex);
      button.dataset.score = String(value);
      button.textContent = value > 0 ? `+${value}` : String(value);
      button.classList.toggle("active", score === value);
      row.appendChild(button);
    });

    els.scoreBoard.appendChild(row);
  });
}

function renderAnalysis() {
  const analysis = getManualAnalysis();
  const stats = getSameTypeStats(analysis.type);
  const confidence = getConfidence(stats, analysis.type);
  const rate = stats.tradable ? pct(stats.hits, stats.tradable) : "데이터 부족";

  els.recordedProbability.textContent = stats.tradable ? `${rate} (${stats.hits}/${stats.tradable})` : "데이터 부족";
  els.confidenceBadge.textContent = confidence.label;
  els.confidenceBadge.className = `confidence-badge ${confidence.className}`;
  els.meterFill.style.width = `${confidence.width}%`;
  els.meterFill.style.background =
    analysis.prediction === "bullish" ? "var(--red)" : analysis.prediction === "bearish" ? "var(--blue)" : "var(--warning)";

  els.resultTitle.className = `result-title ${directionClass(analysis.prediction)}`;
  els.resultTitle.textContent = `오늘 예상: ${directionText(analysis.prediction)}`;
  els.totalScore.textContent = analysis.total > 0 ? `+${analysis.total}` : String(analysis.total);
  els.inertiaState.textContent = analysis.inertia;
  els.patternType.textContent = `${TYPE_META[analysis.type].label} · ${TYPE_META[analysis.type].description}`;
  els.samePatternTotal.textContent = `${stats.total}회`;
  els.samePatternHits.textContent = `${stats.hits}회`;
  els.samePatternRate.textContent = rate;
  els.resultCopy.textContent =
    `${INSTRUMENT_LABEL} 기준 최근 5일 합계가 방향을 결정합니다. 관성 감소는 반전이 아니라 추세 약화로만 해석합니다.`;
}

function playAnalyzeFeedback() {
  els.analyzeBtn.textContent = "SCANNING...";
  els.analyzeBtn.classList.remove("locked");
  els.analyzeBtn.classList.add("scanning");
  els.resultCard.classList.remove("result-pop");

  window.setTimeout(() => {
    renderAnalysis();
    els.analyzeBtn.textContent = "RESULT LOCKED";
    els.analyzeBtn.classList.remove("scanning");
    els.analyzeBtn.classList.add("locked");
    els.resultCard.classList.add("result-pop");
  }, 360);
}

function renderTypeStats() {
  if (!state.data) {
    els.typeStatsTable.innerHTML = `<tr><td colspan="7">MCL=F 데이터를 불러오는 중입니다.</td></tr>`;
    return;
  }

  els.typeStatsTable.innerHTML = Object.keys(TYPE_META)
    .map((type) => {
      const stats = summarize(state.data.validations.filter((record) => record.type === type));
      return { type, stats };
    })
    .sort((a, b) => b.stats.rate - a.stats.rate || b.stats.tradable - a.stats.tradable)
    .map(({ type, stats }) => `
      <tr>
        <td>${TYPE_META[type].label}</td>
        <td>${TYPE_META[type].description}</td>
        <td>${stats.total}</td>
        <td>${stats.hits}</td>
        <td>${stats.tradable ? pct(stats.hits, stats.tradable) : "데이터 부족"}</td>
        <td>${stats.bullish}</td>
        <td>${stats.bearish}</td>
      </tr>
    `)
    .join("");
}

function renderRecentValidation() {
  if (!state.data) {
    els.recentValidationTable.innerHTML = `<tr><td colspan="7">MCL=F 데이터를 불러오는 중입니다.</td></tr>`;
    return;
  }

  els.recentValidationTable.innerHTML = state.data.validations
    .slice(-18)
    .reverse()
    .map((record) => `
      <tr>
        <td>${record.date}</td>
        <td>${scoreText(record.scores)}</td>
        <td>${record.total > 0 ? `+${record.total}` : record.total}</td>
        <td>${record.inertia}</td>
        <td>${TYPE_META[record.type].label}</td>
        <td class="${directionClass(record.prediction)}">${directionText(record.prediction)}</td>
        <td class="${directionClass(record.actual)}">${directionText(record.actual)}</td>
      </tr>
    `)
    .join("");
}

function renderAll() {
  renderAnalysis();
  renderTypeStats();
  renderRecentValidation();
}

async function loadData() {
  setStatus("로딩");
  els.dataNote.textContent = "MCL=F 일봉 OHLC 데이터를 불러오고 있습니다.";
  const rows = await fetchDailyOhlc();
  state.data = buildValidation(rows);
  if (state.data.validations.length) {
    setStatus("완료");
    els.dataNote.textContent = `MCL=F: ${rows.length}개 일봉, ${state.data.validations.length}개 과거 검증 케이스 계산 완료.`;
  } else {
    setStatus("데이터 부족");
    els.dataNote.textContent =
      `Yahoo Finance가 현재 MCL=F 일봉 ${rows.length}개만 반환했습니다. 과거 동일 조건 승률 계산에는 최소 26개 이상의 일봉 OHLC가 필요합니다.`;
  }
  renderAll();
}

els.scoreBoard.addEventListener("click", (event) => {
  const button = event.target.closest(".score-btn");
  if (!button) return;
  state.manualScores[Number(button.dataset.day)] = Number(button.dataset.score);
  buildScoreBoard();
  const nextButton = els.scoreBoard.querySelector(
    `.score-btn[data-day="${button.dataset.day}"][data-score="${button.dataset.score}"]`,
  );
  nextButton?.classList.add("pulse");
  window.setTimeout(() => nextButton?.classList.remove("pulse"), 260);
  renderAnalysis();
});

els.analyzeBtn.addEventListener("click", playAnalyzeFeedback);

buildScoreBoard();
renderAll();
loadData().catch((error) => {
  setStatus("오류");
  els.dataNote.textContent = error.message;
});
