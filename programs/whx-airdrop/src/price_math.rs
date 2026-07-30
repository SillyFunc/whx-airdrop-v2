use anchor_lang::prelude::*;
use crate::constants::PRICE_SCALE;
use crate::error::ErrorCode;

/// Calculated claim outcome containing price metadata and token payout amount
pub struct ClaimOutput {
    pub active_id: i32,
    pub bin_step: u16,
    pub price_scaled: u64,
    pub whx_amount: u64,
}

/// Deep Price & Airdrop Token Calculation Engine.
/// Encapsulates binary account deserialization, exponential price math, and USDT-to-WHX conversion.
pub struct PriceMath;

impl PriceMath {
    /// Deep interface entrypoint: Directly converts raw Meteora LbPair account bytes and USDT quota into WHX payout.
    pub fn calculate_whx_airdrop(lb_pair_data: &[u8], usdt_amount_raw: u64) -> Result<ClaimOutput> {
        let (active_id, bin_step) = Self::parse_oracle_params(lb_pair_data)?;
        let price_scaled = Self::calculate_scaled_price(active_id, bin_step)?;
        let whx_amount = Self::calculate_whx_amount(usdt_amount_raw, price_scaled)?;

        Ok(ClaimOutput {
            active_id,
            bin_step,
            price_scaled,
            whx_amount,
        })
    }

    /// Internal helper: Parse active_id (offset 112..116) and bin_step (offset 128..130) from raw LbPair account data
    fn parse_oracle_params(data: &[u8]) -> Result<(i32, u16)> {
        require!(data.len() >= 130, ErrorCode::InvalidPoolAccount);

        let active_id = i32::from_le_bytes(
            data[112..116]
                .try_into()
                .map_err(|_| ErrorCode::InvalidPoolAccount)?,
        );

        let bin_step = u16::from_le_bytes(
            data[128..130]
                .try_into()
                .map_err(|_| ErrorCode::InvalidPoolAccount)?,
        );

        Ok((active_id, bin_step))
    }

    /// Calculate 10^9 scaled price: Price = (1 + bin_step / 10000) ^ active_id
    pub fn calculate_scaled_price(active_id: i32, bin_step: u16) -> Result<u64> {
        let bin_step_f64 = bin_step as f64 / 10000.0;
        let base = 1.0 + bin_step_f64;
        let price_f64 = base.powi(active_id);

        require!(price_f64 > 0.0 && price_f64.is_finite(), ErrorCode::MathOverflow);

        let price_scaled_f64 = price_f64 * (PRICE_SCALE as f64);
        require!(
            price_scaled_f64 >= 1.0 && price_scaled_f64 <= (u64::MAX as f64),
            ErrorCode::MathOverflow
        );

        Ok(price_scaled_f64 as u64)
    }

    /// Calculate WHX raw amount: (usdt_amount_raw * 10^9) / price_scaled
    pub fn calculate_whx_amount(usdt_amount_raw: u64, price_scaled: u64) -> Result<u64> {
        let whx_amount_128 = (usdt_amount_raw as u128)
            .checked_mul(PRICE_SCALE)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(price_scaled as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        u64::try_from(whx_amount_128).map_err(|_| ErrorCode::MathOverflow.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_mock_lb_pair_data(active_id: i32, bin_step: u16) -> Vec<u8> {
        let mut mock_data = vec![0u8; 130];
        mock_data[112..116].copy_from_slice(&active_id.to_le_bytes());
        mock_data[128..130].copy_from_slice(&bin_step.to_le_bytes());
        mock_data
    }

    #[test]
    fn test_deep_price_math_execution() {
        // active_id = -2049, bin_step = 10 -> Price ≈ 0.128765 USDT (1 USDT ≈ 7.766 WHX)
        let mock_data = create_mock_lb_pair_data(-2049, 10);
        let output = PriceMath::calculate_whx_airdrop(&mock_data, 10_000_000).unwrap();

        assert_eq!(output.active_id, -2049);
        assert_eq!(output.bin_step, 10);
        assert_eq!(output.whx_amount, 77_521_962); // ~77.52 WHX for 10 USDT
    }

    #[test]
    fn test_price_math_parity() {
        // active_id = 0, bin_step = 10 -> Price = 1.0
        let price_scaled = PriceMath::calculate_scaled_price(0, 10).unwrap();
        assert_eq!(price_scaled, 1_000_000_000);

        let whx_amount = PriceMath::calculate_whx_amount(10_000_000, price_scaled).unwrap();
        assert_eq!(whx_amount, 10_000_000); // 10 WHX
    }

    #[test]
    fn test_invalid_account_data_len() {
        let invalid_data = vec![0u8; 100];
        let result = PriceMath::calculate_whx_airdrop(&invalid_data, 10_000_000);
        assert!(result.is_err());
    }
}
