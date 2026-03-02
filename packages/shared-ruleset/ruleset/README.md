# Two Worlds (Shared Version) — DSL Ruleset (v2)

This directory contains a **split ruleset** for the shared version of <두 개의 세상, 공유와 독점>.

## Structure

### data/
- `actors.rules` — core actors (`market`, `government`, `relief_pool`)
- `params.rules` — numeric parameters (money unit: 만원)
- `board.rules` — tile layout, city groups, base land rent, special tiles
- `cards_shared.rules` — change-card deck extracted **directly** from `변화카드.pdf` (monopoly-only card excluded), with dedup by (title, body)

### rules/
- `00_api.rules` — interface predicates / emitted events
- `10_special_tiles.rules` — water/power/hospital/relief/jail/university triggers
- `11_lotto.rules` — lotto mini-game (streak, cash-out, failure loses all)
- `12_jail.rules` — jail escape/turn consumption (double escape ends turn, no move)
- `20_economy.rules` — wages, start taxes, basic income, city land rent/house rent, build rules, game end condition
- `30_rehab.rules` — insolvency → basic income → relief payout → rehab(<=3 turns) → debt forgiveness
- `50_cards.rules` — change-card draw/hand semantics (instant vs hold)

### assets/
- `change_cards_cells/` — **per-cell PNG renders** from the PDF (QA)
- `change_cards_manifest.json` — maps each card source cell to extracted (title, body) + stable card_id

## Load order (recommended)
1. `data/actors.rules`
2. `data/params.rules`
3. `data/board.rules`
4. `data/cards_shared.rules`
5. `rules/00_api.rules`
6. `rules/10_special_tiles.rules`
7. `rules/11_lotto.rules`
8. `rules/12_jail.rules`
8. `rules/20_economy.rules`
9. `rules/30_rehab.rules`
10. `rules/50_cards.rules`

## Notes / Policies (resolved)
- **Change-card concrete effect mapping** is not yet encoded; `cards_shared.rules` provides canonical identifiers and exact texts so you can implement effects deterministically.
- **Basic income rounding**: rules use `Share = div(Fund, N)` (integer division). **Remainder stays in `gov_fund`**.
- **Hospital subsidy**: government subsidy transfer is emitted **only if** `gov_fund >= 10` (otherwise skipped).
- **House resale / liquidation**: houses can be sold back at **full cost** (30만/house), **no ordering constraints**. Use `cmd_sell_house/4` or auto-liquidate in executor.
- **Lotto**: payouts are accumulated and paid only on **stop**; failure pays nothing. (Current implementation assumes **entry fee per attempt**; see `rules/11_lotto.rules` NOTE.)


## Change-card concrete effect mapping

Concrete effects are encoded in `data/cards_shared_effects.rules` as `card_effect/3` facts.

- `card_effect(CardId, Kind, ParamsJson)`
- `card_slug(CardId, CamelCaseSlug)` in `data/cards_shared_slugs.rules`
- Cards tagged `card_needs_review/1` require destination selection or multi-target handling (still deterministic once input is provided).


## Modifier subsystem integration

The runtime stores active modifiers in `GlobalState.modifiers[]`. The RulesEngine should bridge them into facts:

- `modifier(ModId, Kind, Scope, TargetPlayer, Value, TtlKind, Remaining, Source).`

Some calculations require multiplier products. If the DSL engine does not support product aggregation, compute products in host code and inject:

- `rent_multiplier(Player, Mprod).`
- `fees_multiplier(Player, Mprod).`
- `cash_multiplier(Player, Mprod).`

Exempt semantics: if `rentExempt` is active, effective rent is 0 and other multipliers are ignored.
