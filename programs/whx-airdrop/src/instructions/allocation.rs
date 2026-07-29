use anchor_lang::prelude::*;

use crate::{
    constants::{GLOBAL_CONFIG_SEED, USER_ALLOCATION_SEED},
    error::ErrorCode,
    state::{GlobalConfig, UserAllocation},
};

// -----------------------------------------------------------------------------
// 1. User Initializes empty UserAllocation PDA (User pays SOL rent)
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitUserAllocation<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + UserAllocation::INIT_SPACE,
        seeds = [USER_ALLOCATION_SEED, user.key().as_ref()],
        bump
    )]
    pub user_allocation: Account<'info, UserAllocation>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_user_allocation(ctx: Context<InitUserAllocation>) -> Result<()> {
    let user_allocation = &mut ctx.accounts.user_allocation;
    user_allocation.usdt_amount = 0;
    user_allocation.bump = ctx.bumps.user_allocation;

    msg!(
        "UserAllocation PDA initialized by user {} (rent paid by user)",
        ctx.accounts.user.key()
    );
    Ok(())
}

// -----------------------------------------------------------------------------
// 2. Admin Authorizes USDT allocation quota for User (0 rent required from Admin)
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// 3. Admin Cancels/Rejects User Allocation (PDA closed, rent 100% refunded to User)
// -----------------------------------------------------------------------------

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
