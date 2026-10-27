const CODES = ["ILS", "EUR", "RON", "USD"];
const SYMBOLS = { ILS: "₪", EUR: "€", RON: "lei", USD: "$" };
const OPERATORS = "+-*/";
const MAX_DIGITS = 12;
const AUTO_REFRESH_MS = 6 * 60 * 60 * 1000;
const STORAGE_KEYS = { rates: "currency.rates", state: "currency.state" };

// Euro foreign exchange reference rates (ECB), 26.10.2026: 1 EUR = 3.4458 ILS = 5.3473 RON = 1.1188 USD
const DEFAULT_RATES = ratesFromEuroBase({ ILS: 3.4458, RON: 5.3473, USD: 1.1188 }, "2026-10-26", "default");

const RATE_SOURCES = [
  {
    url: "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=ILS,RON,USD",
    parse: (data) => ({ perEuro: data.rates, date: data.date })
  },
  {
    url: "https://open.er-api.com/v6/latest/EUR",
    parse: (data) => ({
      perEuro: data.rates,
      date: new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10)
    })
  }
];

const amountFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rateFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4, useGrouping: false });

const rows = Object.fromEntries(
  [...document.querySelectorAll(".currency")].map((row) => [
    row.dataset.code,
    { row, value: row.querySelector(".value"), expr: row.querySelector(".expr") }
  ])
);

const ratesDialog = document.querySelector("#rates-dialog");
const rateInputs = [...document.querySelectorAll("[data-rate]")];
const ratesChipText = document.querySelector("#rates-chip-text");
const ratesMeta = document.querySelector("#rates-meta");
const netDot = document.querySelector("#net-dot");
const refreshButton = document.querySelector("#refresh-rates");
const refreshStatus = document.querySelector("#refresh-status");

const state = {
  active: "ILS",
  expr: "",
  fresh: false,
  rates: DEFAULT_RATES
};

// ---------- storage ----------

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the app still works for this visit.
  }
}

function isValidRates(rates) {
  return Boolean(rates && rates.ilsPer) && CODES.every((code) => rates.ilsPer[code] > 0);
}

function loadSaved() {
  const rates = readStorage(STORAGE_KEYS.rates);
  if (isValidRates(rates)) {
    state.rates = rates;
  }

  const saved = readStorage(STORAGE_KEYS.state);
  if (saved && CODES.includes(saved.active) && typeof saved.expr === "string" && /^[-+*/.\d]*$/.test(saved.expr)) {
    state.active = saved.active;
    state.expr = saved.expr;
    state.fresh = Boolean(saved.fresh);
  }
}

function saveState() {
  writeStorage(STORAGE_KEYS.state, { active: state.active, expr: state.expr, fresh: state.fresh });
}

function saveRates() {
  writeStorage(STORAGE_KEYS.rates, state.rates);
}

// ---------- math ----------

function ratesFromEuroBase(perEuro, date, source) {
  return {
    ilsPer: {
      ILS: 1,
      EUR: perEuro.ILS,
      RON: perEuro.ILS / perEuro.RON,
      USD: perEuro.ILS / perEuro.USD
    },
    date,
    source,
    fetchedAt: source === "default" ? 0 : Date.now()
  };
}

function convert(amount, from, to) {
  return (amount * state.rates.ilsPer[from]) / state.rates.ilsPer[to];
}

function isOperatorAt(expr, index) {
  // A minus at the very start is the sign of the first number, not an operator.
  return index > 0 && OPERATORS.includes(expr[index]);
}

function hasOperator(expr) {
  return [...expr].some((_, index) => isOperatorAt(expr, index));
}

function lastNumber(expr) {
  for (let index = expr.length - 1; index > 0; index -= 1) {
    if (isOperatorAt(expr, index)) {
      return expr.slice(index + 1);
    }
  }
  return expr;
}

function evaluate(expr) {
  const tokens = [];
  let number = "";

  [...expr].forEach((char, index) => {
    if (isOperatorAt(expr, index)) {
      tokens.push(Number(number), char);
      number = "";
    } else {
      number += char;
    }
  });

  if (number === "" || number === "-") {
    // Ignore a trailing operator while the user is still typing.
    tokens.pop();
  } else {
    tokens.push(Number(number));
  }

  if (tokens.length === 0) {
    return 0;
  }

  const terms = [tokens[0]];
  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index];
    const operand = tokens[index + 1];
    if (operator === "*") {
      terms[terms.length - 1] *= operand;
    } else if (operator === "/") {
      terms[terms.length - 1] /= operand;
    } else {
      terms.push(operator === "-" ? -operand : operand);
    }
  }

  const total = terms.reduce((sum, term) => sum + term, 0);
  return Number.isFinite(total) ? Math.round(total * 1e10) / 1e10 : NaN;
}

function toPlainNumber(value, decimals) {
  if (!Number.isFinite(value) || value === 0) {
    return "";
  }
  // Plain digits only (no grouping, no exponent) so the result can be typed on.
  const text = value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: decimals });
  return text === "0" || text === "-0" ? "" : text;
}

// ---------- formatting ----------

function formatAmount(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return amountFormatter.format(value).replace("-", "−");
}

function formatTyped(text) {
  if (text === "" || text === "-") {
    return text === "-" ? "−" : "0";
  }
  const negative = text.startsWith("-");
  const [integer, decimals] = (negative ? text.slice(1) : text).split(".");
  const grouped = integerFormatter.format(Number(integer));
  return `${negative ? "−" : ""}${grouped}${decimals === undefined ? "" : `.${decimals}`}`;
}

function formatExpression(expr) {
  const parts = [];
  let number = "";
  [...expr].forEach((char, index) => {
    if (isOperatorAt(expr, index)) {
      parts.push(formatTyped(number), { "+": "+", "-": "−", "*": "×", "/": "÷" }[char]);
      number = "";
    } else {
      number += char;
    }
  });
  if (number !== "") {
    parts.push(formatTyped(number));
  }
  return parts.join(" ");
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

function formatRate(value) {
  return rateFormatter.format(value);
}

// ---------- render ----------

function render() {
  const amount = evaluate(state.expr);
  const typing = !hasOperator(state.expr);

  CODES.forEach((code) => {
    const { row, value, expr } = rows[code];
    const isActive = code === state.active;
    row.classList.toggle("is-active", isActive);
    row.setAttribute("aria-pressed", String(isActive));

    if (isActive) {
      value.textContent = typing ? formatTyped(state.expr) : formatAmount(amount);
      expr.textContent = typing ? "" : formatExpression(state.expr);
    } else {
      value.textContent = formatAmount(convert(amount, state.active, code));
      expr.textContent = "";
    }
    row.classList.toggle("is-long", value.textContent.length > 10);
    row.classList.toggle("is-xlong", value.textContent.length > 14);
    row.classList.toggle("is-xxlong", value.textContent.length > 17);
  });
}

function renderRates() {
  const { rates } = state;
  const sourceText = {
    default: "שערי ברירת מחדל",
    online: "עודכן מהאינטרנט",
    manual: "שערים שהוזנו ידנית"
  }[rates.source];

  ratesChipText.textContent = `${navigator.onLine ? "" : "אופליין · "}שערים ${formatDate(rates.date)}`;
  ratesMeta.textContent = `${sourceText} · ${formatDate(rates.date)}`;
  netDot.classList.toggle("is-online", navigator.onLine);

  rateInputs.forEach((input) => {
    if (document.activeElement !== input) {
      input.value = formatRate(rates.ilsPer[input.dataset.rate]);
    }
  });
}

// ---------- input ----------

function press(key) {
  let { expr } = state;

  if (/^\d$/.test(key)) {
    if (state.fresh) {
      expr = "";
    }
    const current = lastNumber(expr);
    if (current.replace(/\D/g, "").length >= MAX_DIGITS) {
      return;
    }
    expr = current === "0" || current === "-0" ? expr.slice(0, -1) + key : expr + key;
  } else if (key === ".") {
    if (state.fresh) {
      expr = "";
    }
    const current = lastNumber(expr);
    if (current.includes(".")) {
      return;
    }
    expr += current === "" || current === "-" ? "0." : ".";
  } else if (OPERATORS.includes(key)) {
    if (expr === "" || expr === "-") {
      expr = key === "-" ? "-" : expr;
    } else {
      if (expr.endsWith(".")) {
        expr = expr.slice(0, -1);
      }
      if (isOperatorAt(expr, expr.length - 1)) {
        expr = expr.slice(0, -1);
      }
      expr += key;
    }
  } else if (key === "back") {
    expr = expr.slice(0, -1);
  } else if (key === "clear") {
    expr = "";
  } else if (key === "=") {
    const result = evaluate(expr);
    if (!Number.isFinite(result)) {
      return;
    }
    expr = toPlainNumber(result, 6);
    state.fresh = true;
    state.expr = expr;
    saveState();
    render();
    return;
  }

  state.expr = expr;
  state.fresh = false;
  saveState();
  render();
}

function selectCurrency(code) {
  if (code === state.active) {
    return;
  }
  const amount = evaluate(state.expr);
  state.expr = toPlainNumber(convert(amount, state.active, code), 2);
  state.active = code;
  state.fresh = true;
  saveState();
  render();
}

const KEYBOARD_MAP = {
  Enter: "=",
  "=": "=",
  Backspace: "back",
  Delete: "clear",
  Escape: "clear",
  ",": ".",
  x: "*",
  X: "*"
};

function handleKeyboard(event) {
  if (ratesDialog.open || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  const key = KEYBOARD_MAP[event.key] ?? event.key;
  if (/^[\d.+\-*/=]$/.test(key) || key === "back" || key === "clear") {
    event.preventDefault();
    press(key);
  }
}

// ---------- rates ----------

async function fetchRates() {
  for (const source of RATE_SOURCES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(source.url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) {
        continue;
      }
      const { perEuro, date } = source.parse(await response.json());
      if (["ILS", "RON", "USD"].every((code) => perEuro[code] > 0) && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return ratesFromEuroBase(perEuro, date, "online");
      }
    } catch {
      // Try the next source.
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("No rate source available");
}

async function refreshRates({ quiet }) {
  if (!navigator.onLine) {
    if (!quiet) {
      refreshStatus.textContent = "אין חיבור לאינטרנט — ממשיכים עם השערים השמורים.";
    }
    return;
  }

  refreshButton.disabled = true;
  if (!quiet) {
    refreshStatus.textContent = "מעדכן…";
  }

  try {
    state.rates = await fetchRates();
    saveRates();
    renderRates();
    render();
    refreshStatus.textContent = quiet ? "" : "השערים עודכנו.";
  } catch {
    if (!quiet) {
      refreshStatus.textContent = "לא הצלחתי לעדכן — ממשיכים עם השערים השמורים.";
    }
  } finally {
    refreshButton.disabled = false;
  }
}

function autoRefresh() {
  const { source, fetchedAt } = state.rates;
  if (source !== "manual" && Date.now() - fetchedAt > AUTO_REFRESH_MS) {
    refreshRates({ quiet: true });
  }
}

function handleRateInput(event) {
  const input = event.target;
  const value = Number(input.value.replace(",", "."));
  const valid = value > 0 && Number.isFinite(value);
  input.classList.toggle("is-invalid", !valid);
  if (!valid) {
    return;
  }

  state.rates = {
    ...state.rates,
    ilsPer: { ...state.rates.ilsPer, [input.dataset.rate]: value },
    date: new Date().toISOString().slice(0, 10),
    source: "manual",
    fetchedAt: Date.now()
  };
  saveRates();
  renderRates();
  render();
}

// ---------- wiring ----------

document.querySelectorAll(".key").forEach((button) => {
  button.addEventListener("click", () => press(button.dataset.key));
});

CODES.forEach((code) => {
  rows[code].row.addEventListener("click", () => selectCurrency(code));
});

document.addEventListener("keydown", handleKeyboard);

document.querySelector("#rates-button").addEventListener("click", () => {
  refreshStatus.textContent = "";
  renderRates();
  ratesDialog.showModal();
});

document.querySelector("#rates-close").addEventListener("click", () => ratesDialog.close());

ratesDialog.addEventListener("click", (event) => {
  if (event.target === ratesDialog) {
    ratesDialog.close();
  }
});

ratesDialog.addEventListener("close", () => {
  // Drop any half-typed or invalid value and show the rate actually in use.
  rateInputs.forEach((input) => {
    input.classList.remove("is-invalid");
    input.value = formatRate(state.rates.ilsPer[input.dataset.rate]);
  });
  renderRates();
});

rateInputs.forEach((input) => input.addEventListener("input", handleRateInput));

refreshButton.addEventListener("click", () => refreshRates({ quiet: false }));

window.addEventListener("online", () => {
  renderRates();
  autoRefresh();
});
window.addEventListener("offline", renderRates);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

loadSaved();
renderRates();
render();
autoRefresh();
