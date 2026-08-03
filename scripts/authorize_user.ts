import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WhxAirdrop } from "../target/types/whx_airdrop";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// =============================================================================
// ⚙️ Solana Mainnet-Beta 管理员单用户确权脚本
// 用法: npx ts-node scripts/authorize_user.ts <USER_PUBKEY> <USDT_AMOUNT>
// 示例: npx ts-node scripts/authorize_user.ts 5EhkhAuKSHKoJFj6kKySEaiSfvNJ4b1JAuGYSEJFSSTF 1
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

  // 默认目标用户（如果命令行未指定）
  const defaultUser = "5EhkhAuKSHKoJFj6kKySEaiSfvNJ4b1JAuGYSEJFSSTF";
  const defaultUsdt = "1";

  const targetUserStr = args[0] || defaultUser;
  const usdtAmountStr = args[1] || defaultUsdt;

  let targetUserPubkey: PublicKey;
  try {
    targetUserPubkey = new PublicKey(targetUserStr);
  } catch (e) {
    console.error(`❌ 错误: 无效的 Solana 钱包公钥: "${targetUserStr}"`);
    process.exit(1);
  }

  const usdtAmountNum = parseFloat(usdtAmountStr);
  if (isNaN(usdtAmountNum) || usdtAmountNum <= 0) {
    console.error(`❌ 错误: 无效的 USDT 确权数量: "${usdtAmountStr}"`);
    process.exit(1);
  }

  const usdtAmountRaw = Math.floor(usdtAmountNum * 1_000_000); // 6 decimals

  const currentTimeStr = new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });

  console.log("\n=========================================================================");
  console.log("🔑 Solana Mainnet-Beta 管理员确权授权工具 (Authorize User)");
  console.log("=========================================================================");
  console.log(`⏰ 执行时间       : ${currentTimeStr}`);
  console.log(`🎯 确权目标用户   : ${targetUserPubkey.toBase58()}`);
  console.log(`💵 确权 USDT 额度  : ${usdtAmountNum.toFixed(6)} USDT (${usdtAmountRaw} Raw Units)`);

  // 1. 建立 Solana 主网连接
  const connection = new anchor.web3.Connection(MAINNET_RPC_URL, "confirmed");

  // 2. 加载管理员私钥 (~/.config/solana/id.json)
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

  // 3. 推算 PDA 地址
  const [globalConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    program.programId
  );
  const [userAllocPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_allocation"), targetUserPubkey.toBuffer()],
    program.programId
  );

  console.log(`· GlobalConfig PDA: ${globalConfigPda.toBase58()}`);
  console.log(`· 用户 PDA 地址   : ${userAllocPda.toBase58()}`);

  // 4. 检查 PDA 账户是否已存在
  console.log("\n-------------------------------------------------------------------------");
  console.log("🔍 检查用户 PDA 链上状态...");
  const allocAccInfo = await connection.getAccountInfo(userAllocPda);

  if (allocAccInfo === null) {
    console.error(`\n❌ 提示: 目标用户 ${targetUserPubkey.toBase58()} 的 UserAllocation PDA 尚未开户初始化！`);
    console.error(`   用户需要在前端 DApp 连接钱包点击“开户/Init”，创建 PDA 后管理员方可发起确权授权。`);
    process.exit(1);
  }

  const currentAlloc = await program.account.userAllocation.fetch(userAllocPda);
  console.log(`   ├─ 当前已确权 USDT  : ${Number(currentAlloc.usdtAmount) / 1e6} USDT`);
  console.log(`   ├─ 提取状态 claimed  : ${currentAlloc.claimed}`);
  console.log(`   └─ 已提取 WHX 数量   : ${Number(currentAlloc.claimedAmount) / 1e6} WHX`);

  if (currentAlloc.claimed) {
    console.error(`\n⚠️ 警告: 该用户之前已经提取过空投 (claimed: true)，无法重复确权或覆盖。`);
    process.exit(1);
  }

  if (currentAlloc.usdtAmount.toNumber() > 0) {
    console.error(`\n⚠️ 警告: 该用户已有确权配额 ${Number(currentAlloc.usdtAmount) / 1e6} USDT (set-once 语义，不可覆盖)。`);
    process.exit(1);
  }

  // 5. 管理员发起 authorizeUser 链上确权
  console.log("\n-------------------------------------------------------------------------");
  console.log(`🚀 正向主网打包提交 authorizeUser 确权交易... (${usdtAmountNum} USDT)`);

  const authTx = await retryAction(async () => {
    return await program.methods
      .authorizeUser(new anchor.BN(usdtAmountRaw))
      .accountsPartial({
        admin: adminKeypair.publicKey,
        user: targetUserPubkey,
        globalConfig: globalConfigPda,
        userAllocation: userAllocPda,
      })
      .signers([adminKeypair])
      .rpc();
  });

  // 6. 验证链上写入结果
  const updatedAlloc = await program.account.userAllocation.fetch(userAllocPda);

  console.log("\n=========================================================================");
  console.log("🎉 管理员确权授权 100% 成功！！");
  console.log("=========================================================================");
  console.log(`· 确权目标用户   : ${targetUserPubkey.toBase58()}`);
  console.log(`· 确认写入额度   : ✨ ${(Number(updatedAlloc.usdtAmount) / 1e6).toFixed(6)} USDT ✨ (Raw: ${updatedAlloc.usdtAmount.toString()})`);
  console.log(`· 用户 PDA 地址   : ${userAllocPda.toBase58()}`);
  console.log(`· 链上交易 Solscan : https://solscan.io/tx/${authTx}`);
  console.log("=========================================================================\n");
}

main().catch(console.error);
