# WHX Airdrop Solana Devnet 最新合约部署与全流程测试日志

本文档记录了带有 **33,000 USDT 链上熔断死门防护** 的 `whx_airdrop` 智能合约部署至 **Solana Devnet (测试网)** 后的完整链上日志、公钥数据与交易签名。

---

## 📌 1. 33,000 USDT 链上防超发安全防护机制

- **最大总预算硬顶**: `max_total_usdt = 33_000_000_000` (固定 **33,000 USDT**)
- **链上实时累加器**: `total_authorized_usdt` (记录全网所有已授权用户确权 U 额度总和)
- **硬熔断拦截错误**: `ExceedsTotalAirdropLimit` (当全网授权额度尝试突破 33,000 U 时，链上直接拒绝熔断)
- **动态释放机制**: 若管理员调用 `cancel_user_allocation` 撤销授权，被撤销的 U 额度自动归还至 33,000 U 额度池中。

---

## 📌 2. 最新链上部署与账户汇总

- **部署时间**: 2026-07-29 16:44:18 (CST)
- **部署网络**: Solana Devnet (Helius 专用 RPC)
- **部署者 (Admin) 钱包**: `EvrfwzjFAzXaoLww39vYobST4VxxiEUep17Wi5WpvDuW`
- **最新合约 Program ID**: `3jkwSf6RG912UinxyAMXyMLomWYGkgAiP9iVGiM6ruEJ`
- **GlobalConfig PDA**: `6qCb6TCpCm1jQqRUhhA8NBmYCgueBmdN8eMqEFKfK8hn`

---

## 🔗 3. Solscan 区块链浏览器链接

- **最新合约控制台**: [Solscan Program 3jkwSf6RG912UinxyAMXyMLomWYGkgAiP9iVGiM6ruEJ](https://solscan.io/account/3jkwSf6RG912UinxyAMXyMLomWYGkgAiP9iVGiM6ruEJ?cluster=devnet)

---

## 🧪 4. 单元与集成测试结果汇总

1. **Rust 原生单元测试 (`cargo test`)**：**4 项测试 100% 通过**。
2. **Anchor 5 大场景集成测试 (`anchor test --skip-build`)**：
   - 场景一：用户连钱包开户 (垫付 SOL 租金) ✅
   - 场景二：管理员确权授权 10 U ✅
   - 场景三：用户 Claim 算价领奖 (销毁 PDA 并 100% 退租金) ✅
   - 场景四：管理员驳回申请 (销毁 PDA 100% 退租金) ✅
   - **场景五：33,000 USDT 链上死门硬熔断拦截测试 (超额授权捕获 ExceedsTotalAirdropLimit) ✅**
