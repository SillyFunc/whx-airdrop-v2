pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod price_math;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use events::*;
pub use instructions::*;
pub use price_math::*;
pub use state::*;

declare_id!("3jkwSf6RG912UinxyAMXyMLomWYGkgAiP9iVGiM6ruEJ");

/// WHX Airdrop Program (Pure Production Architecture)
#[program]
pub mod whx_airdrop {
    use super::*;

    /// Initialize the global configuration PDA.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handle_initialize(ctx)
    }

    /// Update global configuration parameters (Admin only).
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_admin: Option<Pubkey>,
        new_whx_vault: Option<Pubkey>,
        new_lb_pair: Option<Pubkey>,
    ) -> Result<()> {
        instructions::update_config::handle_update_config(
            ctx,
            new_admin,
            new_whx_vault,
            new_lb_pair,
        )
    }

    /// User initializes empty UserAllocation PDA paying own SOL rent.
    pub fn init_user_allocation(ctx: Context<InitUserAllocation>) -> Result<()> {
        instructions::allocation::handle_init_user_allocation(ctx)
    }

    /// Authorize a user with a USDT allocation quota (Admin only, 0 rent required).
    pub fn authorize_user(ctx: Context<AuthorizeUser>, usdt_amount: u64) -> Result<()> {
        instructions::allocation::handle_authorize_user(ctx, usdt_amount)
    }

    /// Batch authorize up to 10 users with USDT allocation quotas in one transaction (Admin only).
    pub fn batch_authorize_users(
        ctx: Context<AuthorizeUsers>,
        users: Vec<Pubkey>,
        amounts: Vec<u64>,
    ) -> Result<()> {
        instructions::allocation::handle_batch_authorize_users(ctx, users, amounts)
    }

    /// User claims WHX airdrop tokens based on real-time Meteora DLMM LbPair price (PDA closed after claim).
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handle_claim(ctx)
    }

    /// Admin withdraws the full WHX vault balance to an arbitrary wallet token account.
    pub fn withdraw_vault(ctx: Context<WithdrawVault>) -> Result<()> {
        instructions::withdraw_vault::handle_withdraw_vault(ctx)
    }

}
