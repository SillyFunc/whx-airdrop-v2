use anchor_lang::prelude::*;

use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct SetLbPair<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Mock LbPair account with buffer size >= 130 bytes
    #[account(mut)]
    pub lb_pair: UncheckedAccount<'info>,
}

pub fn handle_set_lb_pair(
    ctx: Context<SetLbPair>,
    active_id: i32,
    bin_step: u16,
) -> Result<()> {
    let lb_pair_account = &ctx.accounts.lb_pair;
    let mut data = lb_pair_account.try_borrow_mut_data()?;
    require!(data.len() >= 130, ErrorCode::InvalidPoolAccount);

    data[112..116].copy_from_slice(&active_id.to_le_bytes());
    data[128..130].copy_from_slice(&bin_step.to_le_bytes());

    msg!(
        "Mock LbPair data populated: active_id={}, bin_step={}",
        active_id,
        bin_step
    );
    Ok(())
}
