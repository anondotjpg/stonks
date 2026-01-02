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
const BUY_SLIPPAGE = 15;
const PRIORITY_FEE = 0.0005;

// Timing - optimized for speed
const BALANCE_CHECK_DELAY = 1500;
const BALANCE_RETRY_DELAY = 2000;
const MAX_BALANCE_RETRIES = 4;
const CONFIRMATION_TIMEOUT = 15000;

// Parallel processing
const CONCURRENT_WALLETS = 10; // Process 10 wallets at once

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

async function processWallet(wallet, token) {
  const result = {
    tokenName: token?.name || 'Unknown',
    claimedAmount: 0,
    bought: false,
    error: null
  };

  try {
    if (!token?.mint_address) {
      result.error = 'No token';
      return result;
    }

    // Get initial balance
    const balanceBefore = await getWalletBalance(wallet.public_key);
    if (balanceBefore === null) {
      result.error = 'Balance check failed';
      return result;
    }

    // Claim fees
    const claimResult = await claimCreatorFees(wallet.api_key, token.mint_address);
    
    // If no fees or claim failed, return immediately - no waiting
    if (!claimResult.success) {
      result.error = claimResult.error;
      return result;
    }
    
    if (!claimResult.claimed) {
      result.error = 'No fees';
      return result; // Skip balance checking entirely
    }

    // Only wait for balance change if claim was successful
    const balanceResult = await waitForBalanceChange(wallet.public_key, balanceBefore);
    const claimedAmount = balanceResult.claimedAmount;
    result.claimedAmount = claimedAmount;
    
    // If balance didn't change despite successful claim, something went wrong
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

    // Calculate buy amount
    const buyAmountSol = claimedAmount - RESERVE_FOR_FEES;
    if (buyAmountSol <= 0.001) {
      result.error = 'Too small after reserve';
      return result;
    }

    // Execute buys
    const isSameToken = TARGET_TOKEN_CA && 
      TARGET_TOKEN_CA.toLowerCase() === token.mint_address.toLowerCase();

    if (isSameToken) {
      // Single buy
      const buyResult = await executeBuy(wallet.api_key, TARGET_TOKEN_CA, buyAmountSol);
      result.bought = buyResult.success;
      
      await logActivity(
        wallet.id,
        buyResult.success ? 'buy_combined_token' : 'buy_combined_token_failed',
        buyResult.success ? `Bought ${token.name} with ${buyAmountSol.toFixed(6)} SOL` : `Failed: ${buyResult.error}`,
        token.name, buyResult.signature, buyAmountSol
      );
    } else {
      // Split 50/50 - run both buys in parallel
      const halfAmount = buyAmountSol / 2;
      
      const [targetResult, selfResult] = await Promise.all([
        TARGET_TOKEN_CA ? executeBuy(wallet.api_key, TARGET_TOKEN_CA, halfAmount) : { success: false },
        executeBuy(wallet.api_key, token.mint_address, halfAmount)
      ]);

      result.bought = targetResult.success || selfResult.success;

      // Log both
      await Promise.all([
        TARGET_TOKEN_CA && logActivity(
          wallet.id,
          targetResult.success ? 'buy_target_token' : 'buy_target_token_failed',
          targetResult.success ? `Bought ${TARGET_TOKEN_NAME} with ${halfAmount.toFixed(6)} SOL` : `Failed: ${targetResult.error}`,
          TARGET_TOKEN_NAME, targetResult.signature, halfAmount
        ),
        logActivity(
          wallet.id,
          selfResult.success ? 'buy_self_token' : 'buy_self_token_failed',
          selfResult.success ? `Bought ${token.name} with ${halfAmount.toFixed(6)} SOL` : `Failed: ${selfResult.error}`,
          token.name, selfResult.signature, halfAmount
        )
      ]);
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
async function processInParallel(wallets, walletTokenMap, concurrency) {
  const results = [];
  
  for (let i = 0; i < wallets.length; i += concurrency) {
    const chunk = wallets.slice(i, i + concurrency);
    
    const chunkResults = await Promise.all(
      chunk.map(wallet => processWallet(wallet, walletTokenMap[wallet.id]))
    );
    
    results.push(...chunkResults);
    
    // Small delay between chunks to avoid rate limits
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

    console.log(`Processing ${wallets.length} wallets (${CONCURRENT_WALLETS} concurrent)`);

    // Process all wallets in parallel
    const results = await processInParallel(wallets, walletTokenMap, CONCURRENT_WALLETS);

    // Calculate stats
    const stats = {
      total: wallets.length,
      claimed: results.filter(r => r.claimedAmount > 0).length,
      bought: results.filter(r => r.bought).length,
      noFees: results.filter(r => r.error === 'No fees').length,
      belowMin: results.filter(r => r.error?.includes('Below minimum')).length,
      errors: results.filter(r => r.error && r.error !== 'No fees' && !r.error.includes('Below minimum')).length,
      totalClaimed: results.reduce((sum, r) => sum + (r.claimedAmount || 0), 0)
    };

    const duration = Date.now() - startTime;

    console.log(`=== COMPLETE in ${duration}ms ===`);
    console.log(`Claimed: ${stats.claimed} | Bought: ${stats.bought} | Total: ${stats.totalClaimed.toFixed(6)} SOL`);

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      ...stats,
      totalClaimed: `${stats.totalClaimed.toFixed(6)} SOL`,
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