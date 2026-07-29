use anchor_lang::prelude::*;

use crate::{
    constants::{GLOBAL_CONFIG_SEED, USER_ALLOCATION_SEED},
    error::ErrorCode,
    state::{GlobalConfig, UserAllocation},
};

#[derive(Accounts)]
pub struct CancelUserAllocation<'info> {
    pub admin: Signer<'info>,

    /// CHECK: User wallet receiving full rent refund
    #[account(mut)]
    pub user: UncheckedAccount<'info>,

    #[account(
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
        has_one = admin @ ErrorCode::Unauthorized
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [USER_ALLOCATION_SEED, user.key().as_ref()],
        bump = user_allocation.bump,
        close = user
    )]
    pub user_allocation: Account<'info, UserAllocation>,
}

pub fn handle_cancel_user_allocation(ctx: Context<CancelUserAllocation>) -> Result<()> {
    msg!(
        "Airdrop allocation for user {} cancelled by admin. Rent 100% refunded to user.",
        ctx.accounts.user.key()
    );
    Ok(())
}
