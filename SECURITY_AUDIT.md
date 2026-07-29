# WHX Airdrop Program - Security Audit & Defense Report (Streamlined Meteora DLMM V2)

## 1. Overview
The `whx_airdrop` Solana program allows authorized users to claim WHX airdrop tokens derived from their approved USDT allocation quota and real-time prices computed from Meteora DLMM V2 `LbPair` liquidity pool state (`active_id` and `bin_step`).

This report summarizes the security defenses implemented to prevent DeFi attack vectors including precision loss, account spoofing, and replay attacks.

---

## 2. Security Vectors & Defenses

### 2.1 Meteora DLMM V2 Price Calculation
- **Price Formula**: Real-time WHX/USDT exchange rate is calculated on-chain directly from Meteora DLMM `LbPair` parameters:
  $$\text{price} = \left(1 + \frac{\text{bin\_step}}{10,000}\right)^{\text{active\_id}}$$
- **Standardized Scaling ($10^9$)**: Calculated price is scaled by $10^9$ (`PRICE_SCALE = 1_000_000_000`), where `1_000_000_000` represents 1.0 USDT per WHX.
- **Math Sanity Guard**:
  ```rust
  require!(price_f64 > 0.0 && price_f64.is_finite(), ErrorCode::MathOverflow);
  ```

### 2.2 Account Integrity & LbPair Address Verification
- **Threat**: Malicious actors passing fraudulent state accounts to spoof active bin IDs or inflate claim amounts.
- **Defense Implementation**:
  - `claim` instruction verifies on-chain constraints matching account keys with `GlobalConfig` stored `lb_pair` pubkey:
    ```rust
    #[account(
        constraint = lb_pair.key() == global_config.lb_pair @ ErrorCode::InvalidPoolAccount
    )]
    pub lb_pair: UncheckedAccount<'info>,
    ```
  - Unmatched accounts return `InvalidPoolAccount` immediately.

### 2.3 Math Safety & Precision Protection
- **Threat**: Floating-point / fixed-point conversion bugs, overflow or underflow.
- **Defense Implementation**:
  1. `powi` exponentiation computes price ratio smoothly in `f64`.
  2. Intermediate token conversion uses 128-bit checked arithmetic:
     $$\text{WHX\_amount\_raw} = \frac{\text{usdt\_amount\_raw} \times 10^9}{\text{price\_scaled}}$$
     ```rust
     let whx_amount_128 = (usdt_amount_raw as u128)
         .checked_mul(PRICE_SCALE)
         .ok_or(ErrorCode::MathOverflow)?
         .checked_div(price_scaled as u128)
         .ok_or(ErrorCode::MathOverflow)?;
     ```

### 2.4 Replay Attack & Rent Recovery
- **Threat**: Double-claiming authorization quotas.
- **Defense Implementation**:
  - `UserAllocation` PDA is closed upon claim completion:
    ```rust
    #[account(
        mut,
        seeds = [USER_ALLOCATION_SEED, user.key().as_ref()],
        bump = user_allocation.bump,
        close = admin
    )]
    pub user_allocation: Account<'info, UserAllocation>,
    ```
  - Deletes account data (preventing double claims) and refunds rent lamports back to `admin`.

### 2.5 Privilege Isolation
- Admin instructions (`authorize_user`, `update_config`, `emergency_withdraw`) strictly enforce `has_one = admin @ ErrorCode::Unauthorized` and `admin.is_signer == true`.

---

## 3. Summary
The streamlined `whx_airdrop` program provides robust, production-grade security for Meteora DLMM V2 price integration, ensuring accurate bin pricing, arithmetic safety, account authenticity, and rent efficiency.
