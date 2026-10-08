# Wealth Planner — Ruby on Rails + React

Same investment & retirement calculator suite (SIP, Step-Up SIP, Retirement Fund, SWP Strategy) as the original Lovable project, rebuilt with:

- **Backend:** Ruby on Rails 8 API
- **Frontend:** React 19 + Vite + Recharts (matching dark UI template)
- **New:** Upload **PDF / XLSX / CSV** on the Retirement tab to auto-fill ages, expenses, inflation, returns and savings, then recalculate.

## Structure

```
wealth_planner_ror/
  app/services/wealth_calculator.rb   # Same math as original TS
  app/controllers/api/                # calculate + parse_retirement_file
  frontend/                           # React UI (template-matched)
```

## Setup

### Rails API

```bash
cd wealth_planner_ror
bundle install
bin/rails db:prepare
bin/rails server -p 3000
```

### React UI

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` → Rails `:3000`.

## Upload

1. Open **Retirement Fund** tab.
2. Drag-drop or choose PDF / XLSX / CSV (e.g. your retirement plan sheet).
3. Backend (Roo + CSV + PDF text) maps fields into the form; corpus/readiness recompute.
4. If API is down, client-side heuristics still extract common numbers from text/CSV.

## API examples

```bash
curl -s -X POST http://localhost:3000/api/calculate \
  -H 'Content-Type: application/json' \
  -d '{"type":"sip","inputs":{"monthly":10000,"rate":12,"years":20}}'

curl -s -X POST http://localhost:3000/api/parse_retirement_file \
  -F file=@/path/to/plan.xlsx
```

## Notes

- Calculations mirror the original `wealth-calculations.ts` logic (INR formatting, readiness %, SWP depletion, etc.).
- Illustrative only — not financial advice.
