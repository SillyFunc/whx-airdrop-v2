use anchor_lang::prelude::*;

/// Emitted when Admin authorizes or updates USDT quota for a user.
#[event]
pub struct UserAuthorizedEvent {
    pub user: Pubkey,
    pub usdt_amount: u64,
    pub total_authorized: u64,
}

/// Emitted when User successfully claims WHX tokens.
#[event]
pub struct UserClaimedEvent {
    pub user: Pubkey,
    pub usdt_amount: u64,
    pub whx_amount: u64,
}

/// Emitted when Admin cancels user allocation.
#[event]
pub struct UserCancelledEvent {
    pub user: Pubkey,
    pub refunded_usdt: u64,
}
