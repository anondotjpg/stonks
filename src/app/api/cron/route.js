import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

// Configuration
const TARGET_TOKEN_CA = process.env.TARGET_TOKEN_CA;
const TARGET_TOKEN_NAME = process.env.TARGET_TOKEN_NAME || 'Stonks Fund';
const MIN_CLAIMED_TO_BUY = 0.01;
const RESERVE_FOR_FEES = 0.002;
const TRANSFER_FEE = 0.000005;
const BUY_SLIPPAGE = 15;
const PRIORITY_FEE = 0.0005;

// Timing
const BALANCE_CHECK_DELAY = 1500;
const BALANCE_RETRY_DELAY = 2000;
const MAX_BALANCE_RETRIES = 4;

// Parallel processing
const CONCURRENT_WALLETS = 10;

function verifyCronSecret(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getWalletBalance(publicKey) {
  try {
    const balance = await connection.getBalance(new PublicKey(publicKey), 'confirmed');
    return balance / LAMPORTS_PER_SOL;
  } catch {
    return null;
  }
}

async function waitForBalanceChange(publicKey, previousBalance) {
  await sleep(BALANCE_CHECK_DELAY);
  
  for (let i = 0; i < MAX_BALANCE_RETRIES; i++) {
    const currentBalance = await getWalletBalance(publicKey);
    if (currentBalance === null) {
      await sleep(BALANCE_RETRY_DELAY);
      continue;
    }
    
    const difference = currentBalance - previousBalance;
    if (difference > 0.0001) {
      return { newBalance: currentBalance, claimedAmount: difference };
    }
    
    if (i < MAX_BALANCE_RETRIES - 1) {
      await sleep(BALANCE_RETRY_DELAY);
    }
  }
  
  const finalBalance = await getWalletBalance(publicKey);
  if (finalBalance !== null && finalBalance > previousBalance) {
    return { newBalance: finalBalance, claimedAmount: finalBalance - previousBalance };
  }
  
  return { newBalance: finalBalance || previousBalance, claimedAmount: 0 };
}

async function claimCreatorFees(apiKey, mintAddress) {
  try {
    const response = await fetch(`https://pumpportal.fun/api/trade?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: "collectCreatorFee",
        priorityFee: PRIORITY_FEE,
        pool: "pump",
        mint: mintAddress
      })
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      if (responseText.toLowerCase().includes('no fees') || 
          responseText.toLowerCase().includes('nothing to claim') ||
          responseText.toLowerCase().includes('insufficient')) {
        return { success: true, claimed: false };
      }
      return { success: false, error: responseText };
    }

    let result;
    try { result = JSON.parse(responseText); } catch { result = {}; }
    
    return {
      success: true,
      claimed: true,
      signature: result.signature || result.txSignature
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeBuy(apiKey, mintAddress, amountSol) {
  try {
    const roundedAmount = Math.floor(amountSol * 1000000) / 1000000;
    if (roundedAmount < 0.001) return { success: false, error: 'Amount too small' };

    const response = await fetch(`https://pumpportal.fun/api/trade?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'buy',
        mint: mintAddress,
        amount: roundedAmount,
        denominatedInSol: 'true',
        slippage: BUY_SLIPPAGE,
        priorityFee: PRIORITY_FEE,
        pool: 'auto'
      })
    });

    const responseText = await response.text();
    if (!response.ok) return { success: false, error: responseText };

    let result;
    try { result = JSON.parse(responseText); } catch { result = {}; }
    
    if (result.errors?.length > 0) return { success: false, error: result.errors.join(', ') };

    return { 
      success: true, 
      signature: result.signature || result.txSignature || result.transaction 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function transferSol(fromApiKey, toAddress, amountSol) {
  try {
    const roundedAmount = Math.floor(amountSol * 1000000) / 1000000;
    if (roundedAmount < 0.001) return { success: false, error: 'Amount too small' };

    const response = await fetch(`https://pumpportal.fun/api/transfer?api-key=${fromApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: toAddress,
        amount: roundedAmount
      })
    });

    const responseText = await response.text();
    if (!response.ok) return { success: false, error: responseText };

    let result;
    try { result = JSON.parse(responseText); } catch { result = {}; }

    return { 
      success: true, 
      signature: result.signature || result.txSignature || result.transaction 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function logActivity(walletId, type, description, tokenName, signature, amountSol) {
  try {
    await supabase.from('wallet_activities').insert([{
      wallet_id: walletId,
      activity_type: type,
      activity_description: description,
      token_name: tokenName,
      transaction_signature: signature || null,
      amount_sol: amountSol || null,
      created_at: new Date().toISOString()
    }]);
  } catch {}
}

// Process wallet: claim fees, transfer to dev (if not dev), buy self token
async function processWallet(wallet, token, devWallet) {
  const result = {
    walletId: wallet.id,
    tokenName: token?.name || 'Unknown',
    claimedAmount: 0,
    selfBought: false,
    transferredToDev: 0,
    error: null
  };

  try {
    if (!token?.mint_address) {
      result.error = 'No token';
      return result;
    }

    const isDevWallet = devWallet && wallet.id === devWallet.id;

    // Get initial balance
    const balanceBefore = await getWalletBalance(wallet.public_key);
    if (balanceBefore === null) {
      result.error = 'Balance check failed';
      return result;
    }

    // Claim fees
    const claimResult = await claimCreatorFees(wallet.api_key, token.mint_address);
    
    if (!claimResult.success) {
      result.error = claimResult.error;
      return result;
    }
    
    if (!claimResult.claimed) {
      result.error = 'No fees';
      return result;
    }

    // Wait for balance change
    const balanceResult = await waitForBalanceChange(wallet.public_key, balanceBefore);
    const claimedAmount = balanceResult.claimedAmount;
    result.claimedAmount = claimedAmount;
    
    if (claimedAmount === 0) {
      result.error = 'Claim sent but no balance change';
      return result;
    }

    // Log claim
    await logActivity(
      wallet.id, 'fee_claimed',
      `Claimed ${claimedAmount.toFixed(6)} SOL for ${token.name}`,
      token.name, claimResult.signature, claimedAmount
    );

    // Check minimum
    if (claimedAmount < MIN_CLAIMED_TO_BUY) {
      result.error = `Below minimum (${claimedAmount.toFixed(4)} SOL)`;
      await supabase.from('secure_wallets')
        .update({ last_fee_collection: new Date().toISOString() })
        .eq('id', wallet.id);
      return result;
    }

    const buyAmountSol = claimedAmount - RESERVE_FOR_FEES;
    if (buyAmountSol <= 0.001) {
      result.error = 'Too small after reserve';
      return result;
    }

    if (isDevWallet) {
      // Dev wallet: don't buy yet, will be included in batched buy at the end
      // Just track the amount for the batch
      result.transferredToDev = buyAmountSol; // Add own fees to batch
      result.selfBought = true; // Mark as handled
      
      await logActivity(
        wallet.id, 'fee_claimed_for_batch',
        `Added ${buyAmountSol.toFixed(6)} SOL to batched ${TARGET_TOKEN_NAME} buy`,
        token.name, claimResult.signature, buyAmountSol
      );
    } else {
      // Other wallets: split 50/50
      const halfAmount = buyAmountSol / 2;
      
      // Buy self token
      const selfResult = await executeBuy(wallet.api_key, token.mint_address, halfAmount);
      result.selfBought = selfResult.success;
      
      await logActivity(
        wallet.id,
        selfResult.success ? 'buy_self_token' : 'buy_self_token_failed',
        selfResult.success ? `Bought ${token.name} with ${halfAmount.toFixed(6)} SOL` : `Failed: ${selfResult.error}`,
        token.name, selfResult.signature, halfAmount
      );

      // Transfer to dev wallet for batched target buy
      if (devWallet) {
        const transferAmount = halfAmount - TRANSFER_FEE;
        const transferResult = await transferSol(wallet.api_key, devWallet.public_key, transferAmount);
        
        if (transferResult.success) {
          result.transferredToDev = transferAmount;
          await logActivity(
            wallet.id, 'transfer_to_dev',
            `Transferred ${transferAmount.toFixed(6)} SOL to dev wallet for ${TARGET_TOKEN_NAME} buy`,
            token.name, transferResult.signature, transferAmount
          );
        } else {
          await logActivity(
            wallet.id, 'transfer_to_dev_failed',
            `Failed to transfer: ${transferResult.error}`,
            token.name, null, halfAmount
          );
        }
      }
    }

    // Update wallet
    await supabase.from('secure_wallets')
      .update({ last_fee_collection: new Date().toISOString() })
      .eq('id', wallet.id);

  } catch (error) {
    result.error = error.message;
  }

  return result;
}

// Process wallets in parallel chunks
async function processInParallel(wallets, walletTokenMap, devWallet, concurrency) {
  const results = [];
  
  for (let i = 0; i < wallets.length; i += concurrency) {
    const chunk = wallets.slice(i, i + concurrency);
    
    const chunkResults = await Promise.all(
      chunk.map(wallet => processWallet(wallet, walletTokenMap[wallet.id], devWallet))
    );
    
    results.push(...chunkResults);
    
    if (i + concurrency < wallets.length) {
      await sleep(500);
    }
  }
  
  return results;
}

export async function GET(request) {
  const startTime = Date.now();
  
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('=== FEE COLLECTION START ===');

    // Fetch wallets and tokens in parallel
    const [walletsResponse, tokensResponse] = await Promise.all([
      supabase.from('secure_wallets').select('*').eq('is_active', true),
      supabase.from('tokens').select('wallet_id, mint_address, name, symbol').not('wallet_id', 'is', null)
    ]);

    if (walletsResponse.error) throw new Error(walletsResponse.error.message);
    
    const wallets = walletsResponse.data || [];
    if (!wallets.length) {
      return NextResponse.json({ success: true, message: 'No wallets', processed: 0 });
    }

    // Build token map
    const walletTokenMap = {};
    (tokensResponse.data || []).forEach(token => {
      walletTokenMap[token.wallet_id] = token;
    });

    // Find dev wallet - the wallet that owns the target token
    let devWallet = null;
    if (TARGET_TOKEN_CA) {
      const targetToken = (tokensResponse.data || []).find(
        t => t.mint_address?.toLowerCase() === TARGET_TOKEN_CA.toLowerCase()
      );
      if (targetToken) {
        devWallet = wallets.find(w => w.id === targetToken.wallet_id);
        if (devWallet) {
          console.log(`Dev wallet: ${devWallet.public_key.slice(0, 8)}... (${targetToken.name})`);
        }
      }
    }

    console.log(`Processing ${wallets.length} wallets (${CONCURRENT_WALLETS} concurrent)`);

    // PHASE 1: Process all wallets (claim, self-buy, transfer to dev)
    const results = await processInParallel(wallets, walletTokenMap, devWallet, CONCURRENT_WALLETS);

    // PHASE 2: One big buy from dev wallet with all transferred SOL
    let devBuyResult = null;
    const totalTransferred = results.reduce((sum, r) => sum + (r.transferredToDev || 0), 0);
    
    if (devWallet && totalTransferred > 0.001) {
      console.log(`\n=== DEV WALLET BUY: ${totalTransferred.toFixed(6)} SOL ===`);
      
      // Wait for transfers to settle
      await sleep(3000);
      
      // Get dev wallet balance to confirm
      const devBalance = await getWalletBalance(devWallet.public_key);
      console.log(`Dev wallet balance: ${devBalance?.toFixed(6) || 'unknown'} SOL`);
      
      // Buy with all transferred amount (minus priority fee)
      const buyAmount = totalTransferred - PRIORITY_FEE;
      devBuyResult = await executeBuy(devWallet.api_key, TARGET_TOKEN_CA, buyAmount);
      
      if (devBuyResult.success) {
        console.log(`✓ Dev buy success: ${devBuyResult.signature?.slice(0, 8)}...`);
        
        await logActivity(
          devWallet.id, 'buy_target_token_batched',
          `Batched buy: ${TARGET_TOKEN_NAME} with ${buyAmount.toFixed(6)} SOL from ${results.filter(r => r.transferredToDev > 0).length} tokens`,
          TARGET_TOKEN_NAME, devBuyResult.signature, buyAmount
        );
      } else {
        console.log(`✗ Dev buy failed: ${devBuyResult.error}`);
        
        await logActivity(
          devWallet.id, 'buy_target_token_batched_failed',
          `Batched buy failed: ${devBuyResult.error}`,
          TARGET_TOKEN_NAME, null, buyAmount
        );
      }
    }

    // Calculate stats
    const stats = {
      total: wallets.length,
      claimed: results.filter(r => r.claimedAmount > 0).length,
      selfBought: results.filter(r => r.selfBought).length,
      transferred: results.filter(r => r.transferredToDev > 0).length,
      noFees: results.filter(r => r.error === 'No fees').length,
      belowMin: results.filter(r => r.error?.includes('Below minimum')).length,
      errors: results.filter(r => r.error && r.error !== 'No fees' && !r.error.includes('Below minimum')).length,
      totalClaimed: results.reduce((sum, r) => sum + (r.claimedAmount || 0), 0),
      totalTransferred: totalTransferred,
      devBuySuccess: devBuyResult?.success || false
    };

    const duration = Date.now() - startTime;

    console.log(`\n=== COMPLETE in ${duration}ms ===`);
    console.log(`Claimed: ${stats.claimed} | Self-bought: ${stats.selfBought} | Transferred: ${stats.transferred}`);
    console.log(`Total claimed: ${stats.totalClaimed.toFixed(6)} SOL`);
    console.log(`Dev buy: ${stats.devBuySuccess ? '✓' : '✗'} (${totalTransferred.toFixed(6)} SOL)`);

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      ...stats,
      totalClaimed: `${stats.totalClaimed.toFixed(6)} SOL`,
      totalTransferred: `${stats.totalTransferred.toFixed(6)} SOL`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}