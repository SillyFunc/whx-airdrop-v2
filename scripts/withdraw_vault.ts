import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WhxAirdrop } from "../target/types/whx_airdrop";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// =============================================================================
// ⚙️ Solana Mainnet-Beta 管理员全量提取金库 WHX 脚本 (不可逆操作，需 --yes 确认)
// 用法: npx ts-node scripts/withdraw_vault.ts <RECIPIENT_WHX_ATA> [--yes]
// 示例: npx ts-node scripts/withdraw_vault.ts 75nBb11tKBDKWFTXiwfLCnTbioptuXVjrn4Ta52Cyvkt --yes
// 注意: 提取后金库余额归零，所有未 claim 配额将无法发放 (claim 被余额检查拦截)。
//       recipient 必须是指定钱包已创建的 WHX token account (ATA)。
// =============================================================================

const MAINNET_RPC_URL =
  "https://mainnet.helius-rpc.com/?api-key=a2e06fa2-a3ad-4fe2-937c-057725a623c9";

async function retryAction<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      if (i === maxRetries - 1) throw e;
      console.log(`   ⚠️ 网络波动，第 ${i + 1} 次重试中... (${e.message})`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error("Action failed after retries");
}

async function main() {
  const args = process.argv.slice(2);
  const recipientStr = args[0];
  const confirmed = args.includes("--yes");

  if (!recipientStr) {
    console.error("❌ 用法: npx ts-node scripts/withdraw_vault.ts <RECIPIENT_WHX_ATA> [--yes]");
    process.exit(1);
  }

  let recipientPubkey: PublicKey;
  try {
    recipientPubkey = new PublicKey(recipientStr);
  } catch (e) {
    console.error(`❌ 错误: 无效的 Solana 钱包公钥: "${recipientStr}"`);
    process.exit(1);
  }

  const currentTimeStr = new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });

  console.log("\n=========================================================================");
  console.log("💰 Solana Mainnet-Beta 金库全量提取工具 (Withdraw Vault)");
  console.log("=========================================================================");
  console.log(`⏰ 执行时间       : ${currentTimeStr}`);
  console.log(`📥 提取目标账户   : ${recipientPubkey.toBase58()}`);

  // 1. 建立 Solana 主网连接 + 加载管理员私钥
  const connection = new anchor.web3.Connection(MAINNET_RPC_URL, "confirmed");

  const adminKeypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(adminKeypairPath)) {
    console.error(`❌ 无法找到管理员密钥文件: ${adminKeypairPath}`);
    process.exit(1);
  }
  const adminSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(adminKeypairPath, "utf-8"))
  );
  const adminKeypair = Keypair.fromSecretKey(adminSecretKey);
  console.log(`🔐 管理员 Pubkey  : ${adminKeypair.publicKey.toBase58()}`);

  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.WhxAirdrop as Program<WhxAirdrop>;
  console.log(`· 合约 Program ID : ${program.programId.toBase58()}`);

  const [globalConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    program.programId
  );

  // 2. 读取 GlobalConfig + 金库当前余额
  const globalData = await program.account.globalConfig.fetch(globalConfigPda);
  const whxVault = globalData.whxVault;
  const whxMint = globalData.whxMint;

  const vaultBalance = await connection.getTokenAccountBalance(whxVault);
  const vaultRaw = Number(vaultBalance.value.amount);
  const vaultUi = Number(vaultBalance.value.uiAmount ?? 0);

  console.log("\n-------------------------------------------------------------------------");
  console.log("🔍 金库状态:");
  console.log(`   ├─ WHX Vault 地址 : ${whxVault.toBase58()}`);
  console.log(`   ├─ WHX Mint       : ${whxMint.toBase58()}`);
  console.log(`   └─ 金库当前余额   : ${vaultUi.toFixed(6)} WHX (Raw: ${vaultRaw})`);

  if (vaultRaw <= 0) {
    console.error("\n❌ 金库余额为 0，无可提取的 WHX。");
    process.exit(1);
  }

  // 3. 预检 recipient 账户: 存在且 mint 为 WHX
  console.log("\n-------------------------------------------------------------------------");
  console.log("🔍 检查提取目标账户...");
  const recipientInfo = await connection.getAccountInfo(recipientPubkey);
  if (recipientInfo === null) {
    console.error(`\n❌ 提取目标账户不存在: ${recipientPubkey.toBase58()}`);
    console.error(`   请先用钱包/脚本创建该地址的 WHX token account (ATA) 后重试。`);
    process.exit(1);
  }
  const recipientMint = new PublicKey(recipientInfo.data.subarray(0, 32));
  if (!recipientMint.equals(whxMint)) {
    console.error(`\n❌ 提取目标账户的 mint 不是 WHX: ${recipientMint.toBase58()}`);
    console.error(`   需要 mint = ${whxMint.toBase58()} 的 token account。`);
    process.exit(1);
  }

  // 4. 不可逆操作确认
  console.log("\n-------------------------------------------------------------------------");
  console.log(`⚠️  即将把金库中全部 ${vaultUi.toFixed(6)} WHX (Raw: ${vaultRaw}) 提取到:`);
  console.log(`    ${recipientPubkey.toBase58()}`);
  if (!confirmed) {
    console.error("\n❌ 未确认。这是不可逆操作，请确认后追加 --yes 参数再次执行。");
    process.exit(1);
  }
  console.log("✅ 已收到 --yes 确认，继续执行...");

  // 5. 提交 withdraw_vault 交易
  console.log("\n-------------------------------------------------------------------------");
  console.log(`🚀 正向主网打包提交 withdrawVault 全量提取交易...`);

  const tx = await retryAction(async () => {
    return await program.methods
      .withdrawVault()
      .accountsPartial({
        admin: adminKeypair.publicKey,
        globalConfig: globalConfigPda,
        whxVault: whxVault,
        recipient: recipientPubkey,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      })
      .signers([adminKeypair])
      .rpc();
  });

  // 6. 验证链上结果
  const recipientBalance = await connection.getTokenAccountBalance(recipientPubkey);
  const vaultAfter = await connection.getTokenAccountBalance(whxVault);

  console.log("\n=========================================================================");
  console.log("🎉 金库全量提取 100% 成功！！");
  console.log("=========================================================================");
  console.log(`· 提取金额       : ✨ ${vaultUi.toFixed(6)} WHX ✨ (Raw: ${vaultRaw})`);
  console.log(`· 提取目标账户   : ${recipientPubkey.toBase58()}`);
  console.log(`· 目标账户余额   : ${Number(recipientBalance.value.uiAmount ?? 0).toFixed(6)} WHX`);
  console.log(`· 金库剩余余额   : ${Number(vaultAfter.value.amount)} (应归零)`);
  console.log(`· 链上交易 Solscan : https://solscan.io/tx/${tx}`);
  console.log("=========================================================================\n");
}

main().catch(console.error);
