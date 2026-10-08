class WealthCalculator
  CALCULATOR_TYPES = %w[sip stepup retirement swp].freeze

  DEFAULTS = {
    "sip" => { "monthly" => 10000, "rate" => 12, "years" => 20 },
    "stepup" => { "monthly" => 10000, "stepUp" => 10, "rate" => 12, "years" => 20 },
    "retirement" => {
      "currentAge" => 30, "retirementAge" => 60, "monthlyExpenses" => 50000,
      "savings" => 500000, "inflation" => 6, "preRate" => 12, "postRate" => 8, "lifeExpectancy" => 85
    },
    "swp" => { "corpus" => 5_000_000, "withdrawal" => 30_000, "rate" => 8, "years" => 20 }
  }.freeze

  def self.calculate(type, inputs)
    inputs = inputs.transform_keys(&:to_s)
    case type.to_s
    when "sip" then calculate_sip(inputs, false)
    when "stepup" then calculate_sip(inputs, true)
    when "retirement" then calculate_retirement(inputs)
    when "swp" then calculate_swp(inputs)
    else raise ArgumentError, "Unknown calculator type"
    end
  end

  def self.format_inr(value, compact: false)
    amount = value.to_f
    amount = 0 if !amount.finite? || amount < 0
    if compact && amount >= 10_000_000
      "₹#{(amount / 10_000_000.0).round(2)} Cr"
    elsif compact && amount >= 100_000
      "₹#{(amount / 100_000.0).round(2)} L"
    else
      "₹#{amount.round.to_s.reverse.gsub(/(\d{3})(?=\d)/, '\\1,').reverse}"
    end
  end

  def self.clamp(value, min, max)
    v = value.to_f
    return min unless v.finite?
    [[v, min].max, max].min
  end

  def self.calculate_sip(inputs, step_up)
    years = clamp(inputs["years"] || 1, 1, 60).round
    rate = clamp(inputs["rate"] || 0, 0, 40)
    start = clamp(inputs["monthly"] || 0, 0, 5_000_000)
    increase = step_up ? clamp(inputs["stepUp"] || 0, 0, 100) / 100.0 : 0
    months = (years * 12).round
    balance = 0.0
    invested = 0.0
    points = [{ "year" => 0, "invested" => 0, "corpus" => 0 }]
    rows = []
    year_invested = 0.0

    (1..months).each do |month|
      sip = start * ((1 + increase) ** ((month - 1) / 12))
      balance = (balance + sip) * (1 + rate / 1200.0)
      invested += sip
      year_invested += sip
      if month % 12 == 0
        year = month / 12
        rows << {
          "year" => year,
          "monthly" => start * ((1 + increase) ** (year - 1)),
          "annual" => year_invested,
          "invested" => invested,
          "corpus" => balance
        }
        points << { "year" => year, "invested" => invested, "corpus" => balance }
        year_invested = 0.0
      end
    end

    {
      "totalInvested" => invested,
      "returns" => [0, balance - invested].max,
      "corpus" => balance,
      "monthlyInvestment" => start,
      "period" => years,
      "points" => points,
      "rows" => rows,
      "notes" => [
        step_up ? "Your monthly contribution begins at #{format_inr(start)} and rises #{(increase * 100).round}% each year." :
                  "#{format_inr(start)} invested monthly for #{years} years.",
        "This is an illustration; actual investment returns may vary."
      ]
    }
  end

  def self.calculate_retirement(inputs)
    current_age = clamp(inputs["currentAge"] || 18, 18, 100).round
    retirement_age = clamp(inputs["retirementAge"] || (current_age + 1), current_age + 1, 100).round
    life_expectancy = clamp(inputs["lifeExpectancy"] || (retirement_age + 1), retirement_age + 1, 120).round
    years_to_retirement = retirement_age - current_age
    years_in_retirement = life_expectancy - retirement_age
    months_to_retirement = years_to_retirement * 12
    monthly_expense = clamp(inputs["monthlyExpenses"] || 0, 0, 100_000_000)
    savings = clamp(inputs["savings"] || 0, 0, 10_000_000_000)
    inflation = clamp(inputs["inflation"] || 0, 0, 30) / 100.0
    pre_rate = clamp(inputs["preRate"] || 0, 0, 40) / 100.0
    post_rate = clamp(inputs["postRate"] || 0, 0, 40) / 100.0

    expense_at_retirement = monthly_expense * ((1 + inflation) ** years_to_retirement)
    monthly_inflation = ((1 + inflation) ** (1.0 / 12)) - 1
    monthly_return = ((1 + post_rate) ** (1.0 / 12)) - 1
    retirement_months = years_in_retirement * 12

    required_corpus = 0.0
    (1..retirement_months).each do |month|
      expense = expense_at_retirement * ((1 + monthly_inflation) ** (month - 1))
      required_corpus += expense / ((1 + monthly_return) ** month)
    end

    projected_savings = savings * ((1 + pre_rate) ** years_to_retirement)
    additional_corpus = [0, required_corpus - projected_savings].max
    monthly_rate = ((1 + pre_rate) ** (1.0 / 12)) - 1
    factor = if monthly_rate == 0
               months_to_retirement
             else
               ((((1 + monthly_rate) ** months_to_retirement) - 1) / monthly_rate) * (1 + monthly_rate)
             end
    monthly_required = factor > 0 ? additional_corpus / factor : 0
    readiness = required_corpus > 0 ? [[(projected_savings / required_corpus * 100).round, 100].min, 0].max : 100

    points = [{ "year" => 0, "invested" => savings, "corpus" => savings, "required" => 0 }]
    rows = []
    (1..years_to_retirement).each do |year|
      corpus = savings * ((1 + pre_rate) ** year)
      if monthly_rate != 0
        corpus += monthly_required * (12 * ((((1 + monthly_rate) ** (year * 12)) - 1) / monthly_rate) * (1 + monthly_rate))
      end
      safe_corpus = corpus.finite? ? corpus : projected_savings
      points << { "year" => year, "invested" => savings, "corpus" => safe_corpus, "required" => required_corpus * (year.to_f / years_to_retirement) }
      rows << {
        "year" => current_age + year,
        "age" => current_age + year,
        "savings" => savings * ((1 + pre_rate) ** year),
        "required" => required_corpus * (year.to_f / years_to_retirement)
      }
    end
    if years_to_retirement > 0
      points[-1] = {
        "year" => years_to_retirement,
        "invested" => savings,
        "corpus" => projected_savings + (monthly_required * factor),
        "required" => required_corpus
      }
    end

    {
      "totalInvested" => savings + monthly_required * months_to_retirement,
      "returns" => [0, projected_savings + monthly_required * factor - (savings + monthly_required * months_to_retirement)].max,
      "corpus" => projected_savings + monthly_required * factor,
      "monthlyInvestment" => monthly_required,
      "period" => years_to_retirement,
      "points" => points,
      "rows" => rows,
      "notes" => [
        "Your expenses may reach #{format_inr(expense_at_retirement)} per month by age #{retirement_age}.",
        "Inflation, returns and longevity assumptions are illustrative."
      ],
      "readiness" => readiness,
      "requiredCorpus" => required_corpus,
      "additionalCorpus" => additional_corpus,
      "monthlyRequired" => monthly_required,
      "monthlyExpenseAtRetirement" => expense_at_retirement
    }
  end

  def self.calculate_swp(inputs)
    initial = clamp(inputs["corpus"] || 0, 0, 10_000_000_000)
    withdrawal = clamp(inputs["withdrawal"] || 0, 0, 100_000_000)
    years = clamp(inputs["years"] || 1, 1, 60).round
    rate = clamp(inputs["rate"] || 0, 0, 40) / 1200.0
    months = years * 12
    balance = initial
    total_withdrawn = 0.0
    depleted_at = nil
    points = [{ "year" => 0, "invested" => initial, "corpus" => initial, "withdrawn" => 0 }]
    rows = []
    year_opening = initial
    year_withdrawn = 0.0
    year_returns = 0.0

    (1..months).each do |month|
      growth = balance * rate
      balance += growth
      year_returns += growth
      paid = [balance, withdrawal].min
      balance -= paid
      total_withdrawn += paid
      year_withdrawn += paid
      if balance <= 0.005 && depleted_at.nil? && initial > 0
        depleted_at = month / 12.0
      end
      if month % 12 == 0
        year = month / 12
        rows << {
          "year" => year,
          "opening" => year_opening,
          "withdrawal" => year_withdrawn,
          "returns" => year_returns,
          "closing" => balance
        }
        points << { "year" => year, "invested" => initial, "corpus" => balance, "withdrawn" => total_withdrawn }
        year_opening = balance
        year_withdrawn = 0.0
        year_returns = 0.0
      end
    end

    total_returns = total_withdrawn + balance - initial
    result = {
      "totalInvested" => initial,
      "returns" => [0, total_returns].max,
      "corpus" => balance,
      "monthlyInvestment" => withdrawal,
      "period" => years,
      "points" => points,
      "rows" => rows,
      "notes" => depleted_at ?
        ["The starting corpus may be exhausted in approximately #{depleted_at.round(1)} years."] :
        ["Estimated remaining corpus: #{format_inr(balance)}."],
      "totalWithdrawn" => total_withdrawn
    }
    result["depletedAt"] = depleted_at if depleted_at
    result
  end
end
