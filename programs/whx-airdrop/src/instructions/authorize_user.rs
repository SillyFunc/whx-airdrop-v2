use anchor_lang::prelude::*;

use crate::{
    constants::{GLOBAL_CONFIG_SEED, USER_ALLOCATION_SEED},
    error::ErrorCode,
    state::{GlobalConfig, UserAllocation},
};

#[derive(Accounts)]
pub struct AuthorizeUser<'info> {
    pub admin: Signer<'info>,

    /// CHECK: User account receiving allocation quota
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
    )]
    pub user_allocation: Account<'info, UserAllocation>,
}

pub fn handle_authorize_user(ctx: Context<AuthorizeUser>, usdt_amount: u64) -> Result<()> {
    let user_allocation = &mut ctx.accounts.user_allocation;
    user_allocation.usdt_amount = usdt_amount;

    msg!(
        "User {} authorized by admin with USDT allocation {}",
        ctx.accounts.user.key(),
        usdt_amount
    );
    Ok(())
}
