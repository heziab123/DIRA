const shekelFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 0
});

const fields = {
  fullPrice: document.querySelector("#full-price"),
  brokerage: document.querySelector("#brokerage"),
  equityPercent: document.querySelector("#equity-percent"),
  buyers: document.querySelector("#buyers"),
  mortgagePer100k: document.querySelector("#mortgage-per-100k"),
  lawyer: document.querySelector("#lawyer"),
  renovation: document.querySelector("#renovation"),
  extraExpense: document.querySelector("#extra-expense")
};

const outputs = {
  fullPrice: document.querySelector("#full-price-output"),
  brokerage: document.querySelector("#brokerage-output"),
  offerWithBrokerage: document.querySelector("#offer-with-brokerage-output"),
  equityPercent: document.querySelector("#equity-percent-output"),
  buyers: document.querySelector("#buyers-output"),
  mortgagePer100k: document.querySelector("#mortgage-per-100k-output"),
  lawyer: document.querySelector("#lawyer-output"),
  renovation: document.querySelector("#renovation-output"),
  extraExpense: document.querySelector("#extra-expense-output"),
  requiredEquity: document.querySelector("#required-equity"),
  requiredEquityDetail: document.querySelector("#required-equity-detail"),
  equityPerBuyer: document.querySelector("#equity-per-buyer"),
  equityPerBuyerDetail: document.querySelector("#equity-per-buyer-detail"),
  mortgageTotal: document.querySelector("#mortgage-total"),
  mortgageTotalDetail: document.querySelector("#mortgage-total-detail"),
  expensesTotal: document.querySelector("#expenses-total"),
  totalCost: document.querySelector("#total-cost"),
  totalCostDetail: document.querySelector("#total-cost-detail"),
  totalPerBuyer: document.querySelector("#total-per-buyer"),
  totalPerBuyerTop: document.querySelector("#total-per-buyer-top")
};

function numberValue(field) {
  return Number(field.value);
}

function setMoney(output, value) {
  output.textContent = shekelFormatter.format(Math.round(value));
}

function updateSliderLabels(values) {
  setMoney(outputs.fullPrice, values.fullPrice);
  setMoney(outputs.brokerage, values.brokerage);
  setMoney(outputs.offerWithBrokerage, values.offerWithBrokerage);
  outputs.equityPercent.textContent = `${percentFormatter.format(values.equityPercent)}%`;
  outputs.buyers.textContent = percentFormatter.format(values.buyers);
  setMoney(outputs.mortgagePer100k, values.mortgagePer100k);
  setMoney(outputs.lawyer, values.lawyer);
  setMoney(outputs.renovation, values.renovation);
  setMoney(outputs.extraExpense, values.extraExpense);
}

function calculate() {
  const values = {
    fullPrice: numberValue(fields.fullPrice),
    brokerage: numberValue(fields.brokerage),
    equityPercent: numberValue(fields.equityPercent),
    buyers: numberValue(fields.buyers),
    mortgagePer100k: numberValue(fields.mortgagePer100k),
    lawyer: numberValue(fields.lawyer),
    renovation: numberValue(fields.renovation),
    extraExpense: numberValue(fields.extraExpense)
  };
  values.offerWithBrokerage = values.fullPrice + values.brokerage;

  const requiredEquity = values.offerWithBrokerage * (values.equityPercent / 100);
  const equityPerBuyer = requiredEquity / values.buyers;
  const mortgageTotal = (values.fullPrice / 100000) * values.mortgagePer100k;
  const expensesTotal = values.lawyer + values.renovation + values.extraExpense;
  const totalCost = requiredEquity + values.brokerage + expensesTotal;
  const totalPerBuyer = totalCost / values.buyers;

  updateSliderLabels(values);

  setMoney(outputs.requiredEquity, requiredEquity);
  setMoney(outputs.requiredEquityDetail, requiredEquity);
  setMoney(outputs.equityPerBuyer, equityPerBuyer);
  setMoney(outputs.equityPerBuyerDetail, equityPerBuyer);
  setMoney(outputs.mortgageTotal, mortgageTotal);
  setMoney(outputs.mortgageTotalDetail, mortgageTotal);
  setMoney(outputs.expensesTotal, expensesTotal);
  setMoney(outputs.totalCost, totalCost);
  setMoney(outputs.totalCostDetail, totalCost);
  setMoney(outputs.totalPerBuyer, totalPerBuyer);
  setMoney(outputs.totalPerBuyerTop, totalPerBuyer);
}

Object.values(fields).forEach((field) => {
  field.addEventListener("input", calculate);
});

calculate();
