const STORAGE_KEY = "futures-candle-arena-records-v2";
const SYMBOLS = ["Crude Oil", "Nasdaq", "Gold", "S&P500", "기타"];
const SCORE_VALUES = [-3, -2, -1, 0, 1, 2, 3];
const MIN_PATTERN_SAMPLE = 5;

const els = {
  uploadInput: document.querySelector("#chartUpload"),
  imageStatus: document.querySelector("#imageStatus"),
  imageInsight: document.querySelector("#imageInsight"),
  canvas: document.querySelector("#imageCanvas"),
  scoreBoard: document.querySelector("#fiveDayScores"),
  backtestScores: document.querySelector("#backtestScores"),
  calculateBtn: document.querySelector("#calculateBtn"),
  analysisDate: document.querySelector("#analysisDate"),
  symbolSelect: document.querySelector("#symbolSelect"),
  confidenceBadge: document.querySelector("#confidenceBadge"),
  meterFill: document.querySelector("#meterFill"),
  resultTitle: document.querySelector("#resultTitle"),
  resultCopy: document.querySelector("#resultCopy"),
  recordedProbability: document.querySelector("#recordedProbability"),
  totalScore: document.querySelector("#totalScore"),
  inertiaState: document.querySelector("#inertiaState"),
  conditionLabel: document.querySelector("#conditionLabel"),
  samePatternTotal: document.querySelector("#samePatternTotal"),
  sameBullish: document.querySelector("#sameBullish"),
  sameBearish: document.querySelector("#sameBearish"),
  sameProbability: document.querySelector("#sameProbability"),
  mainWinRate: document.querySelector("#mainWinRate"),
  totalPredictions: document.querySelector("#totalPredictions"),
  totalHits: document.querySelector("#totalHits"),
  recentRates: document.querySelector("#recentRates"),
  pendingRecords: document.querySelector("#pendingRecords"),
  symbolStats: document.querySelector("#symbolStats"),
  conditionStats: document.querySelector("#conditionStats"),
  conditionCallout: document.querySelector("#conditionCallout"),
  historyTable: document.querySelector("#historyTable"),
  backtestSymbol: document.querySelector("#backtestSymbol"),
  backtestActual: document.querySelector("#backtestActual"),
  addBacktestBtn: document.querySelector("#addBacktestBtn"),
  backtestWinRate: document.querySelector("#backtestWinRate"),
  avgWinStreak: document.querySelector("#avgWinStreak"),
  avgLossStreak: document.querySelector("#avgLossStreak"),
  maxLossStreak: document.querySelector("#maxLossStreak"),
};

const ctx = els.canvas.getContext("2d", { willReadFrequently: true });
let records = loadRecords();
let scoreState = [0, 0, 0, 0, 0];
let backtestScoreState = [0, 0, 0, 0, 0];
let imageScore = 0;
let imageSignalText = "이미지 보조 신호 없음";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const pct = (wins, total) => (total ? `${((wins / total) * 100).toFixed(1)}%` : "0.0%");
const directionText = (value) => (value === "bullish" ? "양봉" : value === "bearish" ? "음봉" : "중립");
const directionClass = (value) => (value === "bullish" ? "bullish" : value === "bearish" ? "bearish" : "");
const today = () => new Date().toISOString().slice(0, 10);
const makeId = () =>
  globalThis.crypto && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function getInertia(scores) {
  const firstHalf = scores[0] + scores[1];
  const secondHalf = scores[3] + scores[4];
  if (secondHalf - firstHalf >= 2) return "관성 증가";
  if (firstHalf - secondHalf >= 2) return "관성 감소";
  return "관성 유지";
}

function getCondition(total) {
  if (total <= -10) return "강한 매도";
  if (total < 0) return "약한 매도";
  if (total >= 10) return "강한 매수";
  if (total > 0) return "약한 매수";
  return "중립";
}

function getTotalBucket(total) {
  if (total <= -10) return "합계 -10 이하";
  if (total <= -3) return "합계 -9~-3";
  if (total < 3) return "합계 -2~+2";
  if (total < 10) return "합계 +3~+9";
  return "합계 +10 이상";
}

function getPatternKey(scores) {
  const total = scores.reduce((sum, value) => sum + value, 0);
  return `${getTotalBucket(total)} AND ${getInertia(scores)}`;
}

function buildScoreBoard(container, state, onChange) {
  container.innerHTML = "";
  state.forEach((score, dayIndex) => {
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

    container.appendChild(row);
  });

  container.addEventListener("click", (event) => {
    const button = event.target.closest(".score-btn");
    if (!button) return;
    const day = Number(button.dataset.day);
    const value = Number(button.dataset.score);
    state[day] = value;
    onChange();
    buildScoreBoard(container, state, onChange);
  }, { once: true });
}

function getConfidence(sampleSize, absTotal) {
  if (sampleSize >= 30 || absTotal >= 10) return { label: "HIGH", className: "high", width: 92 };
  if (sampleSize >= 10 || absTotal >= 4) return { label: "MID", className: "mid", width: 62 };
  return { label: "LOW", className: "low", width: 34 };
}

function resolvedRecords(source = "analysis") {
  return records.filter((record) => record.source === source && record.actual);
}

function getPatternStats(patternKey) {
  const matches = resolvedRecords().filter((record) => record.patternKey === patternKey);
  const bullish = matches.filter((record) => record.actual === "bullish").length;
  const bearish = matches.filter((record) => record.actual === "bearish").length;
  return { total: matches.length, bullish, bearish };
}

function getConditionStats(condition) {
  const matches = resolvedRecords().filter((record) => record.condition === condition);
  const bullish = matches.filter((record) => record.actual === "bullish").length;
  const bearish = matches.filter((record) => record.actual === "bearish").length;
  return { total: matches.length, bullish, bearish };
}

function getForecast(scores) {
  const total = scores.reduce((sum, value) => sum + value, 0);
  const inertia = getInertia(scores);
  const condition = getCondition(total);
  const patternKey = getPatternKey(scores);
  const patternStats = getPatternStats(patternKey);
  const conditionStats = getConditionStats(condition);
  const heuristicTotal = total + imageScore * 0.55;
  let prediction = heuristicTotal >= 0 ? "bullish" : "bearish";
  let probability = null;
  let basis = "점수 기반 임시 판정";

  if (patternStats.total >= MIN_PATTERN_SAMPLE) {
    prediction = patternStats.bearish > patternStats.bullish ? "bearish" : "bullish";
    probability = Math.max(patternStats.bullish, patternStats.bearish) / patternStats.total;
    basis = "과거 동일 패턴 통계 우선";
  } else if (conditionStats.total >= MIN_PATTERN_SAMPLE) {
    prediction = conditionStats.bearish > conditionStats.bullish ? "bearish" : "bullish";
    probability = Math.max(conditionStats.bullish, conditionStats.bearish) / conditionStats.total;
    basis = "조건부확률 엔진 통계 우선";
  }

  const confidence = getConfidence(Math.max(patternStats.total, conditionStats.total), Math.abs(total));
  return { total, inertia, condition, patternKey, patternStats, conditionStats, prediction, probability, confidence, basis };
}

function renderAnalysis() {
  const forecast = getForecast(scoreState);
  els.totalScore.textContent = forecast.total;
  els.inertiaState.textContent = forecast.inertia;
  els.conditionLabel.textContent = forecast.condition;
  els.confidenceBadge.textContent = forecast.confidence.label;
  els.confidenceBadge.className = `confidence-badge ${forecast.confidence.className}`;
  els.meterFill.style.width = `${forecast.confidence.width}%`;
  els.resultTitle.className = `result-title ${directionClass(forecast.prediction)}`;
  els.resultTitle.textContent = `예상 방향: ${directionText(forecast.prediction)}`;
  els.meterFill.style.background =
    forecast.prediction === "bullish" ? "var(--red)" : forecast.prediction === "bearish" ? "var(--blue)" : "var(--warning)";

  els.samePatternTotal.textContent = `${forecast.patternStats.total}회`;
  els.sameBullish.textContent = `${forecast.patternStats.bullish}회`;
  els.sameBearish.textContent = `${forecast.patternStats.bearish}회`;

  if (forecast.patternStats.total) {
    const major = forecast.patternStats.bearish > forecast.patternStats.bullish ? "음봉" : "양봉";
    const count = Math.max(forecast.patternStats.bullish, forecast.patternStats.bearish);
    els.sameProbability.textContent = `${major} ${pct(count, forecast.patternStats.total)}`;
  } else {
    els.sameProbability.textContent = "데이터 부족";
  }

  if (forecast.probability === null) {
    els.recordedProbability.textContent = "데이터 부족";
  } else {
    els.recordedProbability.textContent = `${directionText(forecast.prediction)} ${(forecast.probability * 100).toFixed(1)}%`;
  }

  els.resultCopy.textContent =
    `${forecast.basis}. 현재 조건은 "${forecast.patternKey}"이며, 기록이 충분하면 이 통계가 점수 예측보다 우선됩니다.`;
}

function addAnalysisRecord() {
  const forecast = getForecast(scoreState);

  records.unshift({
    id: makeId(),
    source: "analysis",
    date: els.analysisDate.value || today(),
    symbol: els.symbolSelect.value,
    scores: [...scoreState],
    totalScore: forecast.total,
    inertia: forecast.inertia,
    condition: forecast.condition,
    patternKey: forecast.patternKey,
    prediction: forecast.prediction,
    confidence: forecast.confidence.label,
    actual: null,
    createdAt: Date.now(),
  });

  saveRecords();
  renderAll();
}

function setActual(id, actual) {
  records = records.map((record) => {
    if (record.id !== id) return record;
    return { ...record, actual, hit: record.prediction === actual };
  });
  saveRecords();
  renderAll();
}

function calcWinSummary(items) {
  const resolved = items.filter((record) => record.actual);
  const hits = resolved.filter((record) => record.hit).length;
  return { total: items.length, resolved: resolved.length, hits, rate: pct(hits, resolved.length) };
}

function renderDashboard() {
  const analysisRecords = records.filter((record) => record.source === "analysis");
  const summary = calcWinSummary(analysisRecords);
  const resolved = resolvedRecords();
  const recent30 = resolved.slice(0, 30);
  const recent100 = resolved.slice(0, 100);

  els.totalPredictions.textContent = summary.total;
  els.totalHits.textContent = summary.hits;
  els.mainWinRate.textContent = summary.rate;
  els.recentRates.textContent =
    `30회 ${pct(recent30.filter((record) => record.hit).length, recent30.length)} / 100회 ${pct(recent100.filter((record) => record.hit).length, recent100.length)}`;
}

function renderPendingRecords() {
  const pending = records.filter((record) => record.source === "analysis" && !record.actual).slice(0, 8);
  els.pendingRecords.innerHTML = pending.length
    ? pending.map((record) => `
      <div class="record-item">
        <div>
          <strong>${record.date} ${record.symbol}</strong>
          <span>${record.patternKey} · 예상 ${directionText(record.prediction)} · ${record.confidence}</span>
        </div>
        <div class="inline-actions">
          <button class="mini-btn bullish" data-actual="bullish" data-id="${record.id}">양봉</button>
          <button class="mini-btn bearish" data-actual="bearish" data-id="${record.id}">음봉</button>
        </div>
      </div>
    `).join("")
    : `<p class="empty-state">실제 결과를 입력할 대기 기록이 없습니다.</p>`;
}

function renderSymbolStats() {
  els.symbolStats.innerHTML = SYMBOLS.map((symbol) => {
    const items = records.filter((record) => record.source === "analysis" && record.symbol === symbol);
    const summary = calcWinSummary(items);
    const rateValue = summary.resolved ? summary.hits / summary.resolved : 0;
    return { symbol, ...summary, rateValue };
  })
    .sort((a, b) => b.rateValue - a.rateValue || b.resolved - a.resolved || b.total - a.total)
    .map((row) => `<tr><td>${row.symbol}</td><td>${row.total}</td><td>${row.hits}</td><td>${row.rate}</td></tr>`)
    .join("");
}

function renderConditionStats() {
  const conditionRows = ["강한 매도", "약한 매도", "중립", "약한 매수", "강한 매수"].map((condition) => {
    const resolved = resolvedRecords().filter((record) => record.condition === condition);
    const bullish = resolved.filter((record) => record.actual === "bullish").length;
    const bearish = resolved.filter((record) => record.actual === "bearish").length;
    const dominant = bearish > bullish ? ["음봉", bearish] : ["양봉", bullish];
    const hits = resolved.filter((record) => record.hit).length;
    const hitRateValue = resolved.length ? hits / resolved.length : 0;
    return { condition, total: resolved.length, bullish, bearish, dominant, hitRate: pct(hits, resolved.length), hitRateValue };
  });
  const patternMap = new Map();

  resolvedRecords().forEach((record) => {
    if (!patternMap.has(record.patternKey)) {
      patternMap.set(record.patternKey, { condition: record.patternKey, total: 0, bullish: 0, bearish: 0, hits: 0 });
    }

    const row = patternMap.get(record.patternKey);
    row.total += 1;
    row[record.actual] += 1;
    if (record.hit) row.hits += 1;
  });

  const patternRows = [...patternMap.values()].map((row) => {
    const dominant = row.bearish > row.bullish ? ["음봉", row.bearish] : ["양봉", row.bullish];
    const hitRateValue = row.total ? row.hits / row.total : 0;
    return { ...row, dominant, hitRate: pct(row.hits, row.total), hitRateValue };
  });

  els.conditionStats.innerHTML = [...conditionRows, ...patternRows]
    .sort((a, b) => b.hitRateValue - a.hitRateValue || b.total - a.total)
    .map((row) => `
      <tr>
        <td>${row.condition}</td>
        <td>${row.total}</td>
        <td>${row.bullish}</td>
        <td>${row.bearish}</td>
        <td>${row.total ? `${row.dominant[0]} ${pct(row.dominant[1], row.total)}` : "데이터 부족"}</td>
        <td>${row.hitRate}</td>
      </tr>
    `).join("");

  const target = resolvedRecords().filter((record) => record.patternKey === "합계 -10 이하 AND 관성 감소");
  const targetBearish = target.filter((record) => record.actual === "bearish").length;
  const targetBullish = target.filter((record) => record.actual === "bullish").length;
  els.conditionCallout.textContent = target.length
    ? `P(음봉 | 합계 -10 이하 AND 관성 감소): 음봉 ${targetBearish}회 / 양봉 ${targetBullish}회 / 음봉 확률 ${pct(targetBearish, target.length)}`
    : "P(음봉 | 합계 -10 이하 AND 관성 감소): 데이터 부족";
}

function renderHistory() {
  const rows = records.filter((record) => record.source === "analysis").slice(0, 40);
  els.historyTable.innerHTML = rows.length
    ? rows.map((record) => `
      <tr>
        <td>${record.date}</td>
        <td>${record.symbol}</td>
        <td>${record.scores.join(", ")}</td>
        <td>${record.totalScore}</td>
        <td>${record.inertia}</td>
        <td class="${directionClass(record.prediction)}">${directionText(record.prediction)}</td>
        <td>${record.confidence}</td>
        <td>${record.actual ? directionText(record.actual) : "대기"}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8">저장된 예측 기록이 없습니다.</td></tr>`;
}

function addBacktestRecord() {
  const forecast = getForecast(backtestScoreState);
  const actual = els.backtestActual.value;

  records.unshift({
    id: makeId(),
    source: "backtest",
    date: today(),
    symbol: els.backtestSymbol.value,
    scores: [...backtestScoreState],
    totalScore: forecast.total,
    inertia: forecast.inertia,
    condition: forecast.condition,
    patternKey: forecast.patternKey,
    prediction: forecast.prediction,
    confidence: forecast.confidence.label,
    actual,
    hit: forecast.prediction === actual,
    createdAt: Date.now(),
  });

  saveRecords();
  renderAll();
}

function streakAverage(streaks) {
  if (!streaks.length) return "0.0";
  return (streaks.reduce((sum, value) => sum + value, 0) / streaks.length).toFixed(1);
}

function renderBacktest() {
  const items = records.filter((record) => record.source === "backtest" && record.actual);
  const hits = items.filter((record) => record.hit).length;
  const winStreaks = [];
  const lossStreaks = [];
  let currentType = null;
  let currentCount = 0;

  [...items].reverse().forEach((record) => {
    const type = record.hit ? "win" : "loss";
    if (type !== currentType && currentCount) {
      (currentType === "win" ? winStreaks : lossStreaks).push(currentCount);
      currentCount = 0;
    }
    currentType = type;
    currentCount += 1;
  });

  if (currentCount) {
    (currentType === "win" ? winStreaks : lossStreaks).push(currentCount);
  }

  els.backtestWinRate.textContent = pct(hits, items.length);
  els.avgWinStreak.textContent = streakAverage(winStreaks);
  els.avgLossStreak.textContent = streakAverage(lossStreaks);
  els.maxLossStreak.textContent = String(Math.max(0, ...lossStreaks));
}

function renderAll() {
  renderAnalysis();
  renderDashboard();
  renderPendingRecords();
  renderSymbolStats();
  renderConditionStats();
  renderHistory();
  renderBacktest();
}

function analyzeImage() {
  const { width, height } = els.canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let redWeight = 0;
  let blueWeight = 0;
  let brightPixels = 0;

  for (let index = 0; index < data.length; index += 16) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const brightness = (red + green + blue) / 3;
    if (brightness < 44) continue;
    brightPixels += 1;

    if (red > blue + 24 && red > green * 0.88) redWeight += red - Math.max(blue, green * 0.72);
    if (blue > red + 18 && blue > green * 0.72) blueWeight += blue - Math.max(red, green * 0.58);
  }

  const totalColor = redWeight + blueWeight;
  if (!brightPixels || totalColor < 1600) {
    imageScore = 0;
    imageSignalText = "캔들 색상 신호가 약합니다.";
    return;
  }

  imageScore = clamp(((redWeight - blueWeight) / totalColor) * 1.8, -1.5, 1.5);
  imageSignalText =
    imageScore > 0.25 ? "이미지 보조 신호는 양봉 쪽입니다." : imageScore < -0.25 ? "이미지 보조 신호는 음봉 쪽입니다." : "이미지 보조 신호는 중립입니다.";
}

function loadImage(file) {
  const image = new Image();
  image.onload = () => {
    const ratio = Math.min(els.canvas.width / image.width, els.canvas.height / image.height);
    const drawWidth = image.width * ratio;
    const drawHeight = image.height * ratio;
    const offsetX = (els.canvas.width - drawWidth) / 2;
    const offsetY = (els.canvas.height - drawHeight) / 2;

    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.fillStyle = "#080d16";
    ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

    els.canvas.classList.add("ready");
    els.imageStatus.textContent = "인식 완료";
    analyzeImage();
    els.imageInsight.textContent = `${imageSignalText} AI 인식이 불완전할 경우 최근 5일 수동 점수 입력을 우선 사용하세요.`;
    renderAnalysis();
    URL.revokeObjectURL(image.src);
  };

  image.onerror = () => {
    els.imageStatus.textContent = "오류";
    els.imageInsight.textContent = "이미지를 읽지 못했습니다. 수동 점수 입력을 사용하세요.";
    imageScore = 0;
    renderAnalysis();
  };

  image.src = URL.createObjectURL(file);
}

els.analysisDate.value = today();
buildScoreBoard(els.scoreBoard, scoreState, renderAnalysis);
buildScoreBoard(els.backtestScores, backtestScoreState, () => {});
els.calculateBtn.addEventListener("click", addAnalysisRecord);
els.addBacktestBtn.addEventListener("click", addBacktestRecord);
els.uploadInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;
  els.imageStatus.textContent = "분석 중";
  els.imageInsight.textContent = "이미지 색상 신호를 읽고 있습니다.";
  loadImage(file);
});
els.pendingRecords.addEventListener("click", (event) => {
  const button = event.target.closest("[data-actual]");
  if (!button) return;
  setActual(button.dataset.id, button.dataset.actual);
});

renderAll();
