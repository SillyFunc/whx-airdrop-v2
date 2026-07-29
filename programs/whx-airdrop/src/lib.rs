pub mod constants;
pub mod error;
pub mod instructions;
pub mod price_math;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
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

    /// Cancel/reject user allocation quota (Admin only, refunds 100% rent to user).
    pub fn cancel_user_allocation(ctx: Context<CancelUserAllocation>) -> Result<()> {
        instructions::allocation::handle_cancel_user_allocation(ctx)
    }

    /// User claims WHX airdrop tokens based on real-time Meteora DLMM LbPair price (refunds 100% rent to user).
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handle_claim(ctx)
    }

    /// Emergency withdraw remaining WHX tokens from program vault (Admin only).
    pub fn emergency_withdraw(ctx: Context<EmergencyWithdraw>, amount: u64) -> Result<()> {
        instructions::emergency_withdraw::handle_emergency_withdraw(ctx, amount)
    }

    /// Set mock LbPair active_id and bin_step (Test environment only).
    #[cfg(feature = "test-sbf")]
    pub fn set_lb_pair(ctx: Context<SetLbPair>, active_id: i32, bin_step: u16) -> Result<()> {
        instructions::set_lb_pair::handle_set_lb_pair(ctx, active_id, bin_step)
    }
}
