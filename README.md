# Laya Paper Lab

## Research and risk upgrade

New signals save headline category (a keyword heuristic), IST time, headline/quote age, available pre-publication price movement, and timestamped scanner context. Missing publication quotes and market context stay null. No market-cap materiality, ATR, VWAP, VIX, sector or spread feature is fabricated.

Fresh signal baselines now create independent 5/15/30/60-minute and 15:20 IST cutoff observations. Targets beyond the live cutoff are omitted; only quotes within 60 seconds after the target qualify. Old signals are not backfilled. Dataset export includes all horizon observations; Learning lab summarizes the most recent 500 records. Training still uses the existing saved holding-period label and its original data gates.

New default controls: 1% stop, 2% target, three simultaneous positions, five-minute news freshness, and a 1% absolute publication-price move cap when a timely publication quote exists. Zero disables stop, target or move cap. New controls are added to existing settings at restart; saved older trade snapshots preserve their previous exit rules. Stops and targets use observed polling prices, not guaranteed trigger-price fills. Percentage protection is not ATR-based or risk-based sizing.

Overview now reports expectancy, profit factor, average win/loss, realized drawdown and losing streak. Learning lab provides exploratory 15/30/60-minute replays, an all-positive-headline control and 20 deterministic random headline-opportunity controls. Random selection matches the qualifying prediction rate in expectation, not random market-time entry. These comparisons do not reconstruct past scanner eligibility and must not be used as promotion evidence. Costs remain estimates; choosing a variant requires a later untouched forward test. Replay applies the new protection and entry rules consistently.

Navigation preserves the selected page in the URL hash. News and Settings can refresh while idle without replacing focused forms. Exchange feeds, live bid/ask fills, verified broker tariffs, and external alerting remain future work.

A local research website and paper-only Indian-equity engine. No real-order API exists in this application.

## Open and start

Website: http://127.0.0.1:4173

From this folder, start both the website and local model with Node.js 24 or newer:

```powershell
node --env-file=.env start.mjs
```

Alternatively, start the website with `node --env-file=.env server.mjs` and the local model in a second terminal:

```powershell
.\.venv\Scripts\python.exe model\adapter.py
```

`Start-Laya.ps1` is another launcher for both services. It reuses an already-running Laya adapter. Keep the launcher running for collection and exits. Ctrl+C stops its children; an adapter that was already running remains in its original terminal.

## Upstox setup

1. Visit https://account.upstox.com/developer/apps and open **Analytics**.
2. Select **Generate Token**, confirm, and copy the full token.
3. Put it after `UPSTOX_ANALYTICS_TOKEN=` in your local `.env` file. Never commit or share this file.
4. Restart the website, then choose **Connections & rules → Live data · paper money**.
5. Leave entries stopped initially to collect news and quotes. Starting the paper engine enables simulated long entries only.

Official documentation: https://upstox.com/developer/api-documentation/analytics-token/

The integration uses GET-only LTP V3 quotes, NSE exchange status, and stock-specific Upstox news. Optional company-specific RSS/Atom feeds can be configured. Feed-to-company matching is explicit; do not assign a general market feed to a single company. Live Upstox responses cannot be verified until a valid token is present.

## Implemented

- Responsive dashboard, market watch, news inbox, trade journal, settings, learning lab.
- Local SQLite persistence with separate demo/live records and downloadable datasets.
- Local `convaiinnovations/laya` English inference via Laya SDK 0.3.21. First download is about 808 MiB. No hosted model calls.
- Fifteen-second quote polling, five-minute news polling, deduplication, timestamps, skipped signals.
- Positive-only long paper entries, confidence filtering, capital allocation, daily trade/loss limits.
- Fixed holding period (default 30 minutes), 15:20 IST close, pending emergency exits, stale-data rejection.
- Rule snapshots per trade and per signal; weekly rule lock after the first trade.
- Slippage and configurable cost estimates. These are not a verified broker/tax tariff.
- Fixed-horizon forward outcomes; missing or more-than-60-seconds-late observations do not enter labeled training data.
- Chronological quote-event replay with capital limits, intratrade daily-loss checks, and explicit missing-data and fill-model limitations.
- Local database backups from Settings.
- Weekly candidate-head training with a frozen Laya encoder, chronological/purged training, calibration, and three held-out completed test weeks. Requires 300 eligible live observations across six completed weeks with the selected holding rule. Candidate artifacts remain separate from the running model.
- Candidate-versus-active-model portfolio review, gated promotion, model history and rollback. Both versions use the same recorded headline times, tradable quotes, costs and risk settings.

## Demo walkthrough

Click **Start paper engine**, then **+ Example**. A synthetic positive headline opens a paper trade; later examples also demonstrate neutral and negative signals. **Stop & close** disables entries and closes at the most recent fresh quotes. Demo prices update while the server is running. A demo trade was created and closed during UI testing; it is clearly labeled and never included in live training data.

## Learning

In Learning lab, export `training-data.json`. It contains only timely, labeled live observations, including signals skipped by the engine. Labels are forward price direction: above +1%, below −1%, otherwise neutral. These labels are not human sentiment annotations. Train a candidate with:

```powershell
.\.venv\Scripts\python.exe model\train.py path\to\training-data.json --epochs 2
```

The script freezes the encoder and trains the decision head using cross-entropy, then fits temperature on the calibration week. This is supervised fine-tuning, not the upstream RLCD algorithm. Artifacts and held-out predictions are saved to `data/candidates/<timestamp>/`. Candidate prediction questions target forward returns, whereas the original base adapter classifies news sentiment. The unchanged active model provides the comparison baseline using its actual deployed question and probabilities. No profitable edge is assumed.

The Learning lab can start a candidate job or enable weekly runs for Sunday at 10 AM IST. The local website server must remain running, and paper entries must be stopped. Jobs with insufficient data are refused. Weekly runs start disabled.

After a website-triggered training job, the server replays both models over all recorded timely headlines in the held-out weeks, including records without usable training labels. Promotion requires at least 100 candidate trades, at least 10 in each of three held-out weeks, positive net improvement every week, no worse drawdown or losing streak, and no missing/delayed quote problems. The active baseline and current risk/cost rules must still match the evaluation. These are conservative project rules, not statistical proof of an edge. Repeated selection on overlapping test weeks can still overfit; a subsequent untouched forward test is needed.

The **Promote candidate** button remains disabled until those checks pass. Promotion and rollback require stopped entries and closed positions. The local model adapter reads the version manifest on its next health check/request, replaces only the trained decision head, and preserves the original encoder and base-head rollback. A failed candidate load blocks inference and exposes an error; use **Rollback previous model** to recover. All prior candidate artifacts remain on disk.

**Not enabled:** phone alerts and an external crash watchdog. Phone alerts were left unconfigured at your request. The first real training run, live Upstox integration, candidate performance and actual promoted-checkpoint operation remain unverified because there is no live history/token or trained candidate yet. Tests cover promotion policy and rollback metadata; a real Laya forward/backward smoke test passed without saving synthetic weights.

The standalone **Run historical replay** action uses stored predictions and is distinct from candidate review, which generates both models' predictions on held-out headlines. Quote-event replay includes estimated costs, allocation, entry caps, intratrade daily-loss checks, normal-session flags and end-of-day exits. Missing exits remain unresolved instead of being silently excluded. It assumes a daily engine restart and does not model executable market fills, bid/ask depth, or inference latency.

## Operational limits

- This is a local prototype. If the computer sleeps, loses connectivity, or the server stops, collection and exits stop. A missed exit is never backdated or fabricated; recovery uses a fresh quote and the actual exit timestamp.
- Market status blocks new entries on holidays; the fixed IST cutoff does not handle special sessions.
- Polling LTP is not a fill simulation and does not prove liquidity. Quote freshness means receipt time, not exchange last-trade time.
- The base model's confidence is not calibrated to this financial task. The adapter uses SDK `answer_confidence`, not its entropy-based `confidence` field.
- Costs are provisional, symmetric basis-point estimates. Configure a verified, date-effective charge model before relying on performance comparisons.
- The server binds to 127.0.0.1, checks Host/Origin and CSRF on mutations, does not expose `.env`, and keeps secrets out of browser state. Local processes can access your files; disk encryption/access controls are your operating system's responsibility.
- Data is stored in `data/laya.sqlite` with SQLite WAL. Use the Backup button for a consistent snapshot while running; copying only the main SQLite file while running is not a complete backup.

## Tests

```powershell
node --test
.\.venv\Scripts\python.exe -m unittest discover -s model -p "test_*.py"
```

Tests cover costs, sizing, hours, validation, no-future entry quotes, labeling exclusions, API security, trade limits, emergency closure and demo/live separation.

## Automatic market discovery

The Market scanner page screens Upstox's daily NSE instrument directory (ordinary EQ shares, NORMAL security type, INE ISIN and single-share lots). In live mode it scans every ten minutes during NORMAL_OPEN, plus an initial after-hours snapshot. It runs only while this local server is running; no desktop automation or external scheduler is required.

Starting screening rules: price at least INR 50, daily gain 1–8%, volume at least 100,000, estimated turnover (volume times average price) at least INR 5 crore, and last price at or above average price. Quotes must have traded on the current IST date, and within five minutes during an open session. Up to 20 candidates are ranked by daily percentage gain times log10(1 + turnover / INR 1 crore). This is a price/volume screen, not earnings or fundamental research; rules have not been validated for profitability.

Candidates automatically join the price and news watchlist. Original/manual stocks stay tracked. Departing automatic candidates remain monitored while positions are open or timely forward outcomes are pending. Their new entries are blocked once deselected or the successful scan is older than twenty minutes. Failed or incomplete scans retain the previous selection; the entry expiry still applies. All existing sentiment, confidence, hours and risk checks also apply. The scanner does not enable paper entries.

Sources: https://upstox.com/developer/api-documentation/instruments/ and https://upstox.com/developer/api-documentation/get-full-market-quote/
