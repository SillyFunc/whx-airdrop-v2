# Domain Glossary (CONTEXT.md)

## Core Domain Concepts

### Global Config
The on-chain singleton authority (`[b"global_config"]`) tracking program parameters, admin pubkey, WHX vault address, Meteora DLMM pool address, and total cumulative claimed USDT budget (`total_authorized_usdt`) against a hard cap (`max_total_usdt` = 33,000 USDT).

### User Allocation
Per-user PDA (`[b"user_allocation", user_pubkey]`) tracking an approved USDT quota (`usdt_amount`), claim status (`claimed`), and claimed WHX token amount (`claimed_amount`). Rent is paid by the user upon initialization and refunded to the user if cancelled by admin. Quota is **set-once per PDA lifecycle**: a non-zero quota cannot be overwritten (authorizing an already-authorized user reverts with `QuotaAlreadySet`), and zero-amount authorization is rejected (`ZeroQuota`); to change a quota, admin must cancel (closes PDA, refunds rent) and the user re-initializes. Admin may authorize via single `authorize_user` or `batch_authorize_users` (≤ 10 users per transaction, user PDAs passed as remaining accounts).

### Meteora DLMM LbPair
The external Meteora Liquidity Book Pair account acting as an on-chain price oracle. Provides bin parameters (`active_id` at offset 112, `bin_step` at offset 128) used to compute the dynamic WHX/USDT exchange rate.

### USDT Quota (USDT 计价额度)
The allocated airdrop valuation benchmark in USDT atomic units (6 decimals) approved for a user by the Admin. USDT is purely an off-chain/on-chain accounting quota unit, NOT a token transferred by the contract. The contract strictly holds and transfers WHX tokens, calculating the final WHX transfer amount dynamically via `whx_amount = (usdt_quota * 10^9) / price_scaled`.

### WHX Vault
The token account holding WHX tokens, owned by the Global Config PDA, from which claimed tokens are transferred to users via CPI. Admin may withdraw the full balance to an arbitrary wallet token account via `withdraw_vault` (admin-only, no amount parameter — full withdrawal only); unclaimed quotas are then blocked by the claim-time `InsufficientVaultBalance` check.

### Price Math Engine
The core domain module responsible for calculating the exponential price formula `Price = (1 + bin_step / 10000) ^ active_id` scaled by 10^9, and converting USDT quota to WHX token amount.
