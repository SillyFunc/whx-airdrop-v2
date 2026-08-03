use anchor_lang::prelude::*;
use std::collections::HashSet;

use crate::{
    constants::{GLOBAL_CONFIG_SEED, MAX_BATCH_USERS, USER_ALLOCATION_SEED},
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
    // Set-once / zero-quota / claimed invariants enforced inside the domain method
    ctx.accounts.user_allocation.set_quota(usdt_amount)?;

    let global_config = &mut ctx.accounts.global_config;

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

// -----------------------------------------------------------------------------
// 4. Admin Batch Authorizes multiple users (single transaction, user PDAs via remaining accounts)
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct AuthorizeUsers<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
        has_one = admin @ ErrorCode::Unauthorized
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handle_batch_authorize_users(
    ctx: Context<AuthorizeUsers>,
    users: Vec<Pubkey>,
    amounts: Vec<u64>,
) -> Result<()> {
    require!(users.len() == amounts.len(), ErrorCode::BatchLengthMismatch);
    require!(
        !users.is_empty() && users.len() <= MAX_BATCH_USERS,
        ErrorCode::BatchTooLarge
    );

    let mut seen = HashSet::new();

    for (i, (user, amount)) in users.iter().zip(amounts.iter()).enumerate() {
        // Reject duplicate users within one batch
        require!(seen.insert(*user), ErrorCode::DuplicateUserInBatch);

        // Each user's allocation PDA must arrive as remaining_accounts[i], in order
        let (expected_pda, _) = Pubkey::find_program_address(
            &[USER_ALLOCATION_SEED, user.as_ref()],
            ctx.program_id,
        );
        let acc_info = ctx
            .remaining_accounts
            .get(i)
            .ok_or(ErrorCode::UserAllocationNotFound)?;
        require!(
            acc_info.key() == expected_pda && acc_info.owner == ctx.program_id,
            ErrorCode::UserAllocationNotFound
        );

        // Deserialize manually (owner already verified above; Account::exit was
        // removed in anchor-lang 1.x so write-back is manual too)
        let mut data = acc_info.try_borrow_mut_data()?;
        let mut data_ref: &[u8] = &data[..];
        let mut user_allocation = UserAllocation::try_deserialize_unchecked(&mut data_ref)?;

        // Single enforcement point: zero-quota / set-once / claimed invariants
        user_allocation.set_quota(*amount)?;

        // Write back discriminator + fields in place
        let mut dst: &mut [u8] = &mut data;
        user_allocation.try_serialize(&mut dst)?;

        emit!(crate::events::UserAuthorizedEvent {
            user: *user,
            usdt_amount: *amount,
            total_authorized: ctx.accounts.global_config.total_authorized_usdt,
        });
    }

    let total_quota = amounts
        .iter()
        .try_fold(0u64, |acc, &a| acc.checked_add(a).ok_or(ErrorCode::MathOverflow))?;

    msg!(
        "Batch authorized {} users, total USDT quota: {} raw units",
        users.len(),
        total_quota
    );
    Ok(())
}
