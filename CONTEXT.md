# Domain Glossary (CONTEXT.md)

## Core Domain Concepts

### Global Config
The on-chain singleton authority (`[b"global_config"]`) tracking program parameters, admin pubkey, WHX vault address, Meteora DLMM pool address, and total cumulative claimed USDT budget (`total_authorized_usdt`) against a hard cap (`max_total_usdt` = 33,000 USDT).

### User Allocation
Per-user PDA (`[b"user_allocation", user_pubkey]`) tracking an approved USDT quota (`usdt_amount`), claim status (`claimed`), and claimed WHX token amount (`claimed_amount`). Rent is paid by the user upon initialization and refunded to the user if cancelled by admin.

### Meteora DLMM LbPair
The external Meteora Liquidity Book Pair account acting as an on-chain price oracle. Provides bin parameters (`active_id` at offset 112, `bin_step` at offset 128) used to compute the dynamic WHX/USDT exchange rate.

### USDT Quota (USDT 计价额度)
The allocated airdrop valuation benchmark in USDT atomic units (6 decimals) approved for a user by the Admin. USDT is purely an off-chain/on-chain accounting quota unit, NOT a token transferred by the contract. The contract strictly holds and transfers WHX tokens, calculating the final WHX transfer amount dynamically via `whx_amount = (usdt_quota * 10^9) / price_scaled`.

### WHX Vault
The token account holding WHX tokens, owned by the Global Config PDA, from which claimed tokens are transferred to users via CPI.

### Price Math Engine
The core domain module responsible for calculating the exponential price formula `Price = (1 + bin_step / 10000) ^ active_id` scaled by 10^9, and converting USDT quota to WHX token amount.
