export type CalculatorType = "sip" | "stepup" | "retirement" | "swp";
export type CalculatorInputs = Record<string, number>;
export type ProjectionPoint = { year: number; invested: number; corpus: number; required?: number; withdrawn?: number };
export type ProjectionRow = Record<string, string | number>;
export type Calculation = {
  totalInvested: number;
  returns: number;
  corpus: number;
  monthlyInvestment: number;
  period: number;
  points: ProjectionPoint[];
  rows: ProjectionRow[];
  notes: string[];
  readiness?: number;
  requiredCorpus?: number;
  additionalCorpus?: number;
  monthlyRequired?: number;
  monthlyExpenseAtRetirement?: number;
  depletedAt?: number;
  totalWithdrawn?: number;
};

export const calculatorLabels: Record<CalculatorType, string> = {
  sip: "SIP Calculator",
  stepup: "Step-Up SIP",
  retirement: "Retirement",
  swp: "SWP Strategy",
};

export const calculatorDefaults: Record<CalculatorType, CalculatorInputs> = {
  sip: { monthly: 10000, rate: 12, years: 20 },
  stepup: { monthly: 10000, stepUp: 10, rate: 12, years: 20 },
  retirement: {
    currentAge: 30, retirementAge: 60, monthlyExpenses: 50000, savings: 500000,
    inflation: 6, preRate: 12, postRate: 8, lifeExpectancy: 85,
  },
  swp: { corpus: 5000000, withdrawal: 30000, rate: 8, years: 20 },
};

export function formatINR(value: number, compact = false): string {
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (compact && amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (compact && amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

export function calculate(type: CalculatorType, inputs: CalculatorInputs): Calculation {
  if (type === "sip") return calculateSip(inputs, false);
  if (type === "stepup") return calculateSip(inputs, true);
  if (type === "retirement") return calculateRetirement(inputs);
  return calculateSwp(inputs);
}

function calculateSip(inputs: CalculatorInputs, stepUp: boolean): Calculation {
  const years = clamp(inputs["years"] ?? 1, 1, 60);
  const rate = clamp(inputs["rate"] ?? 0, 0, 40);
  const start = clamp(inputs["monthly"] ?? 0, 0, 5000000);
  const increase = stepUp ? clamp(inputs["stepUp"] ?? 0, 0, 100) / 100 : 0;
  const months = Math.round(years * 12);
  let balance = 0, invested = 0, yearInvested = 0;
  const points: ProjectionPoint[] = [{ year: 0, invested: 0, corpus: 0 }];
  const rows: ProjectionRow[] = [];
  for (let month = 1; month <= months; month++) {
    const sip = start * (1 + increase) ** Math.floor((month - 1) / 12);
    balance = (balance + sip) * (1 + rate / 1200);
    invested += sip;
    yearInvested += sip;
    if (month % 12 === 0) {
      const year = month / 12;
      rows.push({ year, monthly: start * (1 + increase) ** (year - 1), annual: yearInvested, invested, corpus: balance });
      points.push({ year, invested, corpus: balance });
      yearInvested = 0;
    }
  }
  return {
    totalInvested: invested, returns: Math.max(0, balance - invested), corpus: balance,
    monthlyInvestment: start, period: years, points, rows,
    notes: [
      stepUp ? `Your monthly contribution begins at ${formatINR(start)} and rises ${increase * 100}% each year.` : `${formatINR(start)} invested monthly for ${years} years.`,
      "This is an illustration; actual investment returns may vary.",
    ],
  };
}

function calculateRetirement(inputs: CalculatorInputs): Calculation {
  const currentAge = Math.round(clamp(inputs["currentAge"] ?? 18, 18, 100));
  const retirementAge = Math.round(clamp(inputs["retirementAge"] ?? currentAge + 1, currentAge + 1, 100));
  const lifeExpectancy = Math.round(clamp(inputs["lifeExpectancy"] ?? retirementAge + 1, retirementAge + 1, 120));
  const yearsToRetirement = retirementAge - currentAge;
  const yearsInRetirement = lifeExpectancy - retirementAge;
  const monthsToRetirement = yearsToRetirement * 12;
  const monthlyExpense = clamp(inputs["monthlyExpenses"] ?? 0, 0, 100000000);
  const savings = clamp(inputs["savings"] ?? 0, 0, 10000000000);
  const inflation = clamp(inputs["inflation"] ?? 0, 0, 30) / 100;
  const preRate = clamp(inputs["preRate"] ?? 0, 0, 40) / 100;
  const postRate = clamp(inputs["postRate"] ?? 0, 0, 40) / 100;
  const expenseAtRetirement = monthlyExpense * (1 + inflation) ** yearsToRetirement;
  const monthlyInflation = (1 + inflation) ** (1 / 12) - 1;
  const monthlyReturn = (1 + postRate) ** (1 / 12) - 1;
  const retirementMonths = yearsInRetirement * 12;
  let requiredCorpus = 0;
  for (let month = 1; month <= retirementMonths; month++) {
    const expense = expenseAtRetirement * (1 + monthlyInflation) ** (month - 1);
    requiredCorpus += expense / (1 + monthlyReturn) ** month;
  }
  const projectedSavings = savings * (1 + preRate) ** yearsToRetirement;
  const additionalCorpus = Math.max(0, requiredCorpus - projectedSavings);
  const monthlyRate = (1 + preRate) ** (1 / 12) - 1;
  const factor = monthlyRate === 0 ? monthsToRetirement : (((1 + monthlyRate) ** monthsToRetirement - 1) / monthlyRate) * (1 + monthlyRate);
  const monthlyRequired = factor > 0 ? additionalCorpus / factor : 0;
  const readiness = requiredCorpus > 0 ? Math.min(100, Math.round((projectedSavings / requiredCorpus) * 100)) : 100;
  const points: ProjectionPoint[] = [{ year: 0, invested: savings, corpus: savings, required: 0 }];
  const rows: ProjectionRow[] = [];
  for (let year = 1; year <= yearsToRetirement; year++) {
    const corpus = savings * (1 + preRate) ** year + monthlyRequired * (12 * (((1 + monthlyRate) ** (year * 12) - 1) / (monthlyRate || 1)) * (1 + monthlyRate));
    const safeCorpus = Number.isFinite(corpus) ? corpus : projectedSavings;
    points.push({ year, invested: savings, corpus: safeCorpus, required: requiredCorpus * (year / yearsToRetirement) });
    rows.push({ year: currentAge + year, age: currentAge + year, savings: savings * (1 + preRate) ** year, required: requiredCorpus * (year / yearsToRetirement) });
  }
  if (yearsToRetirement > 0) {
    points[points.length - 1] = { year: yearsToRetirement, invested: savings, corpus: projectedSavings + monthlyRequired * factor, required: requiredCorpus };
  }
  return {
    totalInvested: savings + monthlyRequired * monthsToRetirement,
    returns: Math.max(0, projectedSavings + monthlyRequired * factor - (savings + monthlyRequired * monthsToRetirement)),
    corpus: projectedSavings + monthlyRequired * factor,
    monthlyInvestment: monthlyRequired, period: yearsToRetirement, points, rows,
    notes: [`Your expenses may reach ${formatINR(expenseAtRetirement)} per month by age ${retirementAge}.`, "Inflation, returns and longevity assumptions are illustrative."],
    readiness, requiredCorpus, additionalCorpus, monthlyRequired, monthlyExpenseAtRetirement: expenseAtRetirement,
  };
}

function calculateSwp(inputs: CalculatorInputs): Calculation {
  const initial = clamp(inputs["corpus"] ?? 0, 0, 10000000000);
  const withdrawal = clamp(inputs["withdrawal"] ?? 0, 0, 100000000);
  const years = Math.round(clamp(inputs["years"] ?? 1, 1, 60));
  const rate = clamp(inputs["rate"] ?? 0, 0, 40) / 1200;
  const months = years * 12;
  let balance = initial, totalWithdrawn = 0, depletedAt: number | undefined;
  const points: ProjectionPoint[] = [{ year: 0, invested: initial, corpus: initial, withdrawn: 0 }];
  const rows: ProjectionRow[] = [];
  let yearOpening = initial, yearWithdrawn = 0, yearReturns = 0;
  for (let month = 1; month <= months; month++) {
    const growth = balance * rate;
    balance += growth;
    yearReturns += growth;
    const paid = Math.min(balance, withdrawal);
    balance -= paid;
    totalWithdrawn += paid;
    yearWithdrawn += paid;
    if (balance <= 0.005 && depletedAt === undefined && initial > 0) depletedAt = month / 12;
    if (month % 12 === 0) {
      const year = month / 12;
      rows.push({ year, opening: yearOpening, withdrawal: yearWithdrawn, returns: yearReturns, closing: balance });
      points.push({ year, invested: initial, corpus: balance, withdrawn: totalWithdrawn });
      yearOpening = balance; yearWithdrawn = 0; yearReturns = 0;
    }
  }
  const totalReturns = totalWithdrawn + balance - initial;
  return {
    totalInvested: initial, returns: Math.max(0, totalReturns), corpus: balance,
    monthlyInvestment: withdrawal, period: years, points, rows,
    notes: depletedAt ? [`The starting corpus may be exhausted in approximately ${depletedAt.toFixed(1)} years.`] : [`Estimated remaining corpus: ${formatINR(balance)}.`],
    ...(depletedAt !== undefined ? { depletedAt } : {}), totalWithdrawn,
  };
}
