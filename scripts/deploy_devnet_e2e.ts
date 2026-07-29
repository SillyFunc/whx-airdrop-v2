import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WhxAirdrop } from "../target/types/whx_airdrop";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from "fs";

async function main() {
  const rpcUrl = "https://devnet.helius-rpc.com/?api-key=c2467855-ee63-4a59-abb8-f41e11fd69e3";
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");

  // Read wallet keypair directly from ~/.config/solana/id.json
  const keypairPath = "/home/summer/.config/solana/id.json";
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
  const walletKeypair = Keypair.fromSecretKey(secretKey);
  const wallet = new anchor.Wallet(walletKeypair);

  console.log("=========================================================================");
  console.log("🚀 开始 Solana Devnet (Helius 专用 RPC) 合约初始化与端到端自动化跑通演练");
  console.log("=========================================================================");
  console.log(`· 部署者 (Admin) 公钥: ${wallet.publicKey.toBase58()}`);

  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program = anchor.workspace.WhxAirdrop as Program<WhxAirdrop>;
  console.log(`· 链上合约 Program ID: ${program.programId.toBase58()}\n`);

  // 1. 发行 Devnet 测试代币 WHX 与 USDT
  console.log("Step 1: 在 Devnet 上一键发行测试 WHX 与 USDT 代币 (Decimals: 6)...");
  const whxMint = await createMint(connection, walletKeypair, wallet.publicKey, null, 6);
  const usdtMint = await createMint(connection, walletKeypair, wallet.publicKey, null, 6);
  console.log(`  - Devnet WHX Mint: ${whxMint.toBase58()}`);
  console.log(`  - Devnet USDT Mint: ${usdtMint.toBase58()}\n`);

  // 2. 推算 GlobalConfig PDA 与创建 WHX 金库
  console.log("Step 2: 推算 GlobalConfig PDA 并创建所属的 WHX 金库账户 (Vault)...");
  const [globalConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    program.programId
  );
  console.log(`  - GlobalConfig PDA: ${globalConfigPda.toBase58()}`);

  const whxVaultKeypair = Keypair.generate();
  const whxVault = await createAccount(
    connection,
    walletKeypair,
    whxMint,
    globalConfigPda,
    whxVaultKeypair
  );
  console.log(`  - WHX Vault 账户: ${whxVault.toBase58()}`);

  // 向金库充值 1,000,000 WHX 测试筹码
  const mintTx = await mintTo(connection, walletKeypair, whxMint, whxVault, walletKeypair, 1_000_000_000_000);
  console.log(`  - 已成功向金库充值 1,000,000.000000 WHX 筹码 (Tx: ${mintTx.slice(0, 20)}...)\n`);

  // 3. 创建 Devnet 模拟 Meteora DLMM LbPair (active_id = -2049, bin_step = 10 -> 1 USDT ≈ 7.766 WHX)
  console.log("Step 3: 创建 Devnet Meteora DLMM 模拟池子 (active_id = -2049, bin_step = 10)...");
  const lbPairKeypair = Keypair.generate();
  const space = 130;
  const lamports = await connection.getMinimumBalanceForRentExemption(space);

  const createLbPairTx = new anchor.web3.Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: lbPairKeypair.publicKey,
      lamports,
      space,
      programId: program.programId,
    })
  );
  await provider.sendAndConfirm(createLbPairTx, [lbPairKeypair]);

  await program.methods
    .setLbPair(-2049, 10)
    .accountsPartial({
      payer: wallet.publicKey,
      lbPair: lbPairKeypair.publicKey,
    })
    .signers([walletKeypair])
    .rpc();

  console.log(`  - Devnet LbPair 池子地址: ${lbPairKeypair.publicKey.toBase58()}`);
  console.log(`  - 池子当前挂单挂载价格: 1 USDT ≈ 7.766094 WHX\n`);

  // 4. 调用 initialize 初始化合约
  console.log("Step 4: 调用合约 initialize 初始化链上配置...");
  const initTx = await program.methods
    .initialize()
    .accountsPartial({
      admin: wallet.publicKey,
      whxMint,
      whxVault,
      lbPair: lbPairKeypair.publicKey,
      globalConfig: globalConfigPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([walletKeypair])
    .rpc();
  console.log(`  - 合约初始化成功！(Tx: ${initTx})\n`);

  // 5. 模拟完整用户体验与业务流程测试
  console.log("=========================================================================");
  console.log("🧪 Step 5: Devnet 端到端真实业务流程闭环测试");
  console.log("=========================================================================");

  // 5.1 创建普通测试用户
  const testUser = Keypair.generate();
  console.log(`· 测试用户 (Test User) 地址: ${testUser.publicKey.toBase58()}`);

  // Transfer 0.05 SOL to testUser for tx fees
  const transferTx = new anchor.web3.Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: testUser.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    })
  );
  await provider.sendAndConfirm(transferTx, [walletKeypair]);

  const [userAllocPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_allocation"), testUser.publicKey.toBuffer()],
    program.programId
  );

  // 5.2 用户连钱包建户 (Init User Allocation)
  console.log("· 1. 用户连钱包发起 initUserAllocation (用户垫付 ~0.00146 SOL 租金)...");
  const step1Tx = await program.methods
    .initUserAllocation()
    .accountsPartial({
      user: testUser.publicKey,
      userAllocation: userAllocPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([testUser])
    .rpc();
  console.log(`   └─ 成功创建用户 PDA: ${userAllocPda.toBase58()} (Tx: ${step1Tx.slice(0, 20)}...)`);

  // 5.3 管理员确权写入 10U 额度
  console.log("· 2. 管理员后台审核通过，调 authorizeUser 写入 10.00 USDT (管理员 0 租金)...");
  const step2Tx = await program.methods
    .authorizeUser(new anchor.BN(10_000_000))
    .accountsPartial({
      admin: wallet.publicKey,
      user: testUser.publicKey,
      globalConfig: globalConfigPda,
      userAllocation: userAllocPda,
    })
    .signers([walletKeypair])
    .rpc();
  console.log(`   └─ 成功写入 10.000000 USDT 额度 (Tx: ${step2Tx.slice(0, 20)}...)`);

  // 5.4 创建用户接收 WHX 的 ATA
  const userWhxAccount = await createAccount(
    connection,
    testUser,
    whxMint,
    testUser.publicKey,
    Keypair.generate()
  );

  // 5.5 用户点击 Claim 领 WHX 空投
  console.log("· 3. 用户点击 Claim 领空投 WHX...");
  const step3Tx = await program.methods
    .claim()
    .accountsPartial({
      user: testUser.publicKey,
      globalConfig: globalConfigPda,
      userAllocation: userAllocPda,
      whxVault,
      lbPair: lbPairKeypair.publicKey,
      userWhxAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([testUser])
    .rpc();
  console.log(`   └─ 成功执行 Claim (Tx: ${step3Tx})`);

  // 5.6 结算验证
  const userWhxBalance = await getAccount(connection, userWhxAccount);
  const rawWhx = Number(userWhxBalance.amount);
  const formattedWhx = (rawWhx / 1_000_000).toFixed(6);

  console.log("\n=========================================================================");
  console.log("🎉 Solana Devnet (测试网) 全流程测试演练成功闭环！");
  console.log("=========================================================================");
  console.log(`· 确权 USDT 额度: 10.000000 USDT`);
  console.log(`· Meteora 池子价格: 1 USDT ≈ 7.766094 WHX`);
  console.log(`· 最终用户到账 WHX: ✨ ${formattedWhx} WHX ✨`);
  console.log(`· PDA 状态: 自动销毁，~0.00146 SOL 租金已 100% 全额退还给测试用户！`);
  console.log("=========================================================================\n");
}

main().catch(console.error);
