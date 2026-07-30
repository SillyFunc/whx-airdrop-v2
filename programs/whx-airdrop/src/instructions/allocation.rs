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
    user_allocation.initialize(ctx.bumps.user_allocation);

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
        mut,
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
    require!(
        !ctx.accounts.user_allocation.claimed,
        ErrorCode::AlreadyClaimed
    );

    let global_config = &mut ctx.accounts.global_config;

    ctx.accounts.user_allocation.set_quota(usdt_amount);

    emit!(crate::events::UserAuthorizedEvent {
        user: ctx.accounts.user.key(),
        usdt_amount,
        total_authorized: global_config.total_authorized_usdt,
    });

    msg!(
        "User {} authorized with USDT allocation {}. Total Authorized: {} / {}",
        ctx.accounts.user.key(),
        usdt_amount,
        global_config.total_authorized_usdt,
        global_config.max_total_usdt
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
        mut,
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
    require!(
        !ctx.accounts.user_allocation.claimed,
        ErrorCode::AlreadyClaimed
    );

    let refunded_usdt = ctx.accounts.user_allocation.usdt_amount;

    emit!(crate::events::UserCancelledEvent {
        user: ctx.accounts.user.key(),
        refunded_usdt,
    });

    msg!(
        "Airdrop allocation for user {} cancelled by admin. Rent 100% refunded to user. Allocation {} was not counted as confirmed.",
        ctx.accounts.user.key(),
        refunded_usdt
    );
    Ok(())
}
