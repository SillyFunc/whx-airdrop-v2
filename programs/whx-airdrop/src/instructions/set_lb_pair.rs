use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetLbPair<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Unchecked mock lb_pair account for devnet testing active_id and bin_step
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

    require!(data.len() >= 130, crate::error::ErrorCode::InvalidPoolAccount);

    let active_id_bytes = active_id.to_le_bytes();
    data[112..116].copy_from_slice(&active_id_bytes);

    let bin_step_bytes = bin_step.to_le_bytes();
    data[128..130].copy_from_slice(&bin_step_bytes);

    msg!(
        "Mock LbPair updated: active_id = {}, bin_step = {}",
        active_id,
        bin_step
    );

    Ok(())
}
