use anchor_lang::prelude::*;

use crate::{
    constants::USER_ALLOCATION_SEED,
    state::UserAllocation,
};

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
    user_allocation.usdt_amount = 0; // Initial quota is 0 until admin authorizes
    user_allocation.bump = ctx.bumps.user_allocation;

    msg!(
        "UserAllocation PDA initialized by user {} (rent paid by user)",
        ctx.accounts.user.key()
    );
    Ok(())
}
