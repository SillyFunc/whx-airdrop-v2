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

async function main() {
  const connection = new anchor.web3.Connection("http://127.0.0.1:8899", "confirmed");
  const payer = Keypair.generate();

  // Request SOL for payer
  const airdropSig = await connection.requestAirdrop(payer.publicKey, 20 * LAMPORTS_PER_SOL);
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: airdropSig, ...latestBlockhash });

  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program = anchor.workspace.WhxAirdrop as Program<WhxAirdrop>;

  const admin = Keypair.generate();

  // Airdrop SOL to admin
  const tx1 = await connection.requestAirdrop(admin.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction({ signature: tx1, ...latestBlockhash });

  const [globalConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    program.programId
  );

  const whxMint = await createMint(connection, admin, admin.publicKey, null, 6);
  const usdtMint = await createMint(connection, admin, admin.publicKey, null, 6);

  const whxVault = await createAccount(
    connection,
    admin,
    whxMint,
    globalConfigPda,
    Keypair.generate()
  );

  // Mint 1,000,000 WHX to vault
  await mintTo(connection, admin, whxMint, whxVault, admin, 1_000_000_000_000);

  // Helper to create mock LbPair
  async function createMockLbPair(activeId: number, binStep: number): Promise<PublicKey> {
    const lbPairKeypair = Keypair.generate();
    const space = 130;
    const lamports = await connection.getMinimumBalanceForRentExemption(space);

    const tx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: lbPairKeypair.publicKey,
        lamports,
        space,
        programId: program.programId,
      })
    );
    await provider.sendAndConfirm(tx, [admin, lbPairKeypair]);

    await program.methods
      .setLbPair(activeId, binStep)
      .accountsPartial({
        payer: admin.publicKey,
        lbPair: lbPairKeypair.publicKey,
      })
      .signers([admin])
      .rpc();

    return lbPairKeypair.publicKey;
  }

  const initialLbPair = await createMockLbPair(0, 10);

  // Initialize GlobalConfig
  await program.methods
    .initialize()
    .accountsPartial({
      admin: admin.publicKey,
      whxMint,
      whxVault,
      lbPair: initialLbPair,
      globalConfig: globalConfigPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc();

  // Test scenarios for 10 USDT allocation
  const usdtQuota = 10_000_000; // 10.000000 USDT (6 decimals)

  const scenarios = [
    { label: "基准平价 (1 WHX = 1.0000 USDT)", activeId: 0, binStep: 10 },
    { label: "币价暴涨 (1 WHX ≈ 1.9987 USDT)", activeId: 693, binStep: 10 },
    { label: "币价暴跌 (1 WHX ≈ 0.5003 USDT)", activeId: -693, binStep: 10 },
    { label: "温和上涨 (1 WHX ≈ 1.6477 USDT)", activeId: 250, binStep: 20 },
    { label: "深度下跌 (1 WHX ≈ 0.5490 USDT)", activeId: -400, binStep: 15 },
  ];

  console.log("=========================================================================");
  console.log(`🎯 管理员确权用户空投额度: 10.00 USDT (链上 Raw 单位: ${usdtQuota})`);
  console.log("=========================================================================\n");

  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    const userK = Keypair.generate();
    const sig = await connection.requestAirdrop(userK.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction({ signature: sig, ...latestBlockhash });

    const [userAllocPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), userK.publicKey.toBuffer()],
      program.programId
    );

    // 1. 管理员授权 10 U
    await program.methods
      .authorizeUser(new anchor.BN(usdtQuota))
      .accountsPartial({
        admin: admin.publicKey,
        user: userK.publicKey,
        globalConfig: globalConfigPda,
        userAllocation: userAllocPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    // 2. 创建 Mock LbPair 并更新配置
    const lbPairPubkey = await createMockLbPair(sc.activeId, sc.binStep);
    await program.methods
      .updateConfig(null, null, lbPairPubkey)
      .accountsPartial({
        admin: admin.publicKey,
        globalConfig: globalConfigPda,
      })
      .signers([admin])
      .rpc();

    const userWhxAccount = await createAccount(
      connection,
      userK,
      whxMint,
      userK.publicKey,
      Keypair.generate()
    );

    // 3. 用户调用 claim
    await program.methods
      .claim()
      .accountsPartial({
        user: userK.publicKey,
        admin: admin.publicKey,
        globalConfig: globalConfigPda,
        userAllocation: userAllocPda,
        whxVault,
        lbPair: lbPairPubkey,
        userWhxAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([userK])
      .rpc();

    // 4. 查询实际到账 WHX 数量
    const accountInfo = await getAccount(connection, userWhxAccount);
    const rawWhx = Number(accountInfo.amount);
    const formattedWhx = (rawWhx / 1_000_000).toFixed(6);

    const priceRatio = Math.pow(1 + sc.binStep / 10000, sc.activeId);

    console.log(`场景 ${i + 1}: ${sc.label}`);
    console.log(`  - Meteora DLMM 状态: active_id = ${sc.activeId}, bin_step = ${sc.binStep}`);
    console.log(`  - 实时换算价格: 1 WHX = ${priceRatio.toFixed(6)} USDT`);
    console.log(`  - 用户申请兑换: 10.00 USDT`);
    console.log(`  - 链上精确结算数值 (Raw Units): ${rawWhx}`);
    console.log(`  - 最终确定应得 WHX 数量: ✨ ${formattedWhx} WHX ✨\n`);
  }
}

main().catch(console.error);
