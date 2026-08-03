use anchor_lang::prelude::*;

#[constant]
pub const GLOBAL_CONFIG_SEED: &[u8] = b"global_config";

#[constant]
pub const USER_ALLOCATION_SEED: &[u8] = b"user_allocation";

/// Price precision scale (9 decimals for Meteora DLMM, 1_000_000_000 = 1.0)
pub const PRICE_SCALE: u128 = 1_000_000_000;

/// Max users per batch_authorize_users transaction (1232-byte tx limit leaves headroom)
pub const MAX_BATCH_USERS: usize = 10;
