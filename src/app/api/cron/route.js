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
const MIN_CLAIMED_TO_BUY = 0.01; // Only buy if claimed more than 0.01 SOL
const RESERVE_FOR_FEES = 0.002 * LAMPORTS_PER_SOL;
const BUY_SLIPPAGE = 15;
const PRIORITY_FEE = 0.0005;

// Timing configuration
const FEE_CLAIM_CONFIRMATION_DELAY = 8000;
const TRANSACTION_DELAY = 2000;
const WALLET_DELAY = 1500;

function verifyCronSecret(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.warn('CRON_SECRET not configured');
    return false;
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}

async function getWalletBalance(publicKey, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const balance = await connection.getBalance(new PublicKey(publicKey), 'confirmed');
      return balance;
    } catch (error) {
      console.error(`Failed to get balance for ${publicKey} (attempt ${i + 1}):`, error.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  return 0;
}

async function waitForConfirmation(signature, maxWaitMs = 30000) {
  if (!signature) return false;
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const status = await connection.getSignatureStatus(signature);
      
      if (status?.value?.confirmationStatus === 'confirmed' || 
          status?.value?.confirmationStatus === 'finalized') {
        console.log(`Transaction ${signature.slice(0, 8)}... confirmed`);
        return true;
      }
      
      if (status?.value?.err) {
        console.error(`Transaction ${signature.slice(0, 8)}... failed:`, status.value.err);
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error checking confirmation:', error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.warn(`Transaction ${signature?.slice(0, 8)}... confirmation timeout`);
  return false;
}

async function claimCreatorFees(apiKey, mintAddress = null) {
  try {
    console.log(`Claiming creator fees...`);

    const payload = {
      action: "collectCreatorFee",
      priorityFee: PRIORITY_FEE,
      pool: "pump"
    };
    
    if (mintAddress) {
      payload.mint = mintAddress;
    }

    const response = await fetch(`https://pumpportal.fun/api/trade?api-key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (errorText.toLowerCase().includes('no fees') || 
          errorText.toLowerCase().includes('nothing to claim')) {
        return {
          success: true,
          claimed: false,
          amount: 0,
          message: 'No fees available to claim'
        };
      }
      
      throw new Error(`Claim failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const signature = result.signature || result.txSignature;
    const claimedAmount = result.amount || result.claimedAmount || 0;
    
    return {
      success: true,
      claimed: true,
      signature,
      amount: claimedAmount,
      result
    };
  } catch (error) {
    console.error(`Fee claim failed:`, error.message);
    return {
      success: false,
      claimed: false,
      amount: 0,
      error: error.message
    };
  }
}

async function executeBuy(apiKey, mintAddress, amountSol) {
  try {
    const buyPayload = {
      action: 'buy',
      mint: mintAddress,
      amount: amountSol,
      denominatedInSol: 'true',
      slippage: BUY_SLIPPAGE,
      priorityFee: PRIORITY_FEE,
      pool: 'auto'
    };

    console.log(`Executing buy: ${amountSol} SOL for ${mintAddress} (auto pool detection)`);

    const response = await fetch(`https://pumpportal.fun/api/trade?api-key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buyPayload)
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      throw new Error(`Buy failed: ${response.status} - ${responseText}`);
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }
    
    if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
      throw new Error(`Buy validation error: ${result.errors.join(', ')}`);
    }

    const signature = result.signature || result.txSignature || result.transaction;
    
    console.log(`Buy successful: ${signature}`);
    
    return {
      success: true,
      signature,
      result
    };
    
  } catch (error) {
    console.error(`Buy failed for ${mintAddress}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

async function processWallet(wallet, token) {
  const results = {
    walletId: wallet.id,
    walletPublicKey: wallet.public_key,
    tokenMint: token?.mint_address,
    tokenName: token?.name,
    balanceBefore: 0,
    balanceAfterClaim: 0,
    balanceAfter: 0,
    claimedAmount: 0,
    feeClaim: null,
    targetTokenBuy: null,
    selfTokenBuy: null,
    errors: []
  };

  try {
    // Step 1: Get initial balance
    const balanceBefore = await getWalletBalance(wallet.public_key);
    results.balanceBefore = balanceBefore / LAMPORTS_PER_SOL;
    console.log(`Wallet ${wallet.public_key.slice(0, 8)}...: Initial balance = ${results.balanceBefore.toFixed(6)} SOL`);

    // Step 2: Claim creator fees (if token exists)
    if (!token?.mint_address) {
      results.errors.push('No associated token found - skipping');
      return results;
    }

    const claimResult = await claimCreatorFees(wallet.api_key, token.mint_address);
    results.feeClaim = claimResult;

    // Only proceed with buys if fees were actually claimed
    if (!claimResult.success || !claimResult.claimed) {
      if (claimResult.success && !claimResult.claimed) {
        console.log(`No fees to claim for ${token.name} - skipping buys`);
        results.errors.push('No fees claimed - skipping buys');
      } else {
        console.log(`Fee claim failed for ${token.name} - skipping buys`);
        results.errors.push(`Fee claim failed: ${claimResult.error}`);
      }
      return results;
    }

    // Fees were claimed - check the amount
    const claimedAmountSol = parseFloat(claimResult.amount) || 0;
    results.claimedAmount = claimedAmountSol;
    
    console.log(`Claimed fees for ${token.name}: ${claimedAmountSol.toFixed(6)} SOL`);
    console.log(`Signature: ${claimResult.signature}`);
    
    // Log claim activity with token_name
    await supabase.from('wallet_activities').insert([{
      wallet_id: wallet.id,
      activity_type: 'fee_claimed',
      activity_description: `Claimed creator fees for ${token.name}`,
      token_name: token.name,
      transaction_signature: claimResult.signature || null,
      amount_sol: claimedAmountSol,
      created_at: new Date().toISOString()
    }]);

    // Check if claimed amount meets minimum threshold for buys
    if (claimedAmountSol < MIN_CLAIMED_TO_BUY) {
      console.log(`Claimed amount (${claimedAmountSol.toFixed(6)} SOL) below minimum (${MIN_CLAIMED_TO_BUY} SOL) - skipping buys`);
      results.errors.push(`Claimed amount ${claimedAmountSol.toFixed(6)} SOL below minimum ${MIN_CLAIMED_TO_BUY} SOL - skipping buys`);
      
      // Update wallet record even if not buying
      await supabase
        .from('secure_wallets')
        .update({ 
          last_fee_collection: new Date().toISOString()
        })
        .eq('id', wallet.id);
      
      return results;
    }

    // Wait for transaction confirmation before proceeding with buys
    if (claimResult.signature) {
      console.log(`Waiting for fee claim confirmation...`);
      const confirmed = await waitForConfirmation(claimResult.signature, 15000);
      
      if (!confirmed) {
        console.log(`Confirmation check timed out, waiting additional ${FEE_CLAIM_CONFIRMATION_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, FEE_CLAIM_CONFIRMATION_DELAY));
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } else {
      console.log(`No signature returned, waiting ${FEE_CLAIM_CONFIRMATION_DELAY}ms for balance update...`);
      await new Promise(resolve => setTimeout(resolve, FEE_CLAIM_CONFIRMATION_DELAY));
    }

    // Get balance after claim (for logging purposes)
    const balanceAfterClaim = await getWalletBalance(wallet.public_key);
    results.balanceAfterClaim = balanceAfterClaim / LAMPORTS_PER_SOL;
    console.log(`Balance after claim: ${results.balanceAfterClaim.toFixed(6)} SOL`);

    // Calculate buy amount based on claimed fees (minus reserve for transaction fees)
    const reserveForFeesSol = RESERVE_FOR_FEES / LAMPORTS_PER_SOL;
    const buyAmountSol = claimedAmountSol - reserveForFeesSol;
    
    if (buyAmountSol <= 0) {
      results.errors.push(`No balance available after reserving ${reserveForFeesSol.toFixed(6)} SOL for fees`);
      return results;
    }

    console.log(`Using claimed amount for buys: ${buyAmountSol.toFixed(6)} SOL (after ${reserveForFeesSol.toFixed(6)} SOL reserve)`);

    // Check if target token and self token are the same
    const isSameToken = TARGET_TOKEN_CA && token?.mint_address && 
                        TARGET_TOKEN_CA.toLowerCase() === token.mint_address.toLowerCase();
    
    if (isSameToken) {
      // Same token - do one buy with full claimed amount
      console.log(`Target and self token are the same (${token.name}) - doing single buy with ${buyAmountSol.toFixed(6)} SOL`);
      
      const buyResult = await executeBuy(wallet.api_key, TARGET_TOKEN_CA, buyAmountSol);
      results.targetTokenBuy = {
        tokenMint: TARGET_TOKEN_CA,
        tokenName: token.name,
        amountSol: buyAmountSol,
        combinedBuy: true,
        ...buyResult
      };
      results.selfTokenBuy = results.targetTokenBuy;

      await supabase.from('wallet_activities').insert([{
        wallet_id: wallet.id,
        activity_type: buyResult.success ? 'buy_combined_token' : 'buy_combined_token_failed',
        activity_description: buyResult.success 
          ? `Bought ${token.name} with ${buyAmountSol.toFixed(6)} SOL (from claimed fees)`
          : `Failed to buy ${token.name}: ${buyResult.error}`,
        token_name: token.name,
        transaction_signature: buyResult.signature || null,
        amount_sol: buyAmountSol,
        created_at: new Date().toISOString()
      }]);
      
    } else {
      // Different tokens - split 50/50
      const halfBuyAmount = buyAmountSol / 2;
      console.log(`Splitting claimed amount for buys: ${halfBuyAmount.toFixed(6)} SOL each`);

      // Buy target token (50%)
      if (TARGET_TOKEN_CA) {
        const targetBuyResult = await executeBuy(wallet.api_key, TARGET_TOKEN_CA, halfBuyAmount);
        results.targetTokenBuy = {
          tokenMint: TARGET_TOKEN_CA,
          amountSol: halfBuyAmount,
          ...targetBuyResult
        };

        await supabase.from('wallet_activities').insert([{
          wallet_id: wallet.id,
          activity_type: targetBuyResult.success ? 'buy_target_token' : 'buy_target_token_failed',
          activity_description: targetBuyResult.success 
            ? `Bought ${TARGET_TOKEN_NAME} with ${halfBuyAmount.toFixed(6)} SOL (from claimed fees)`
            : `Failed to buy ${TARGET_TOKEN_NAME}: ${targetBuyResult.error}`,
          token_name: TARGET_TOKEN_NAME,
          transaction_signature: targetBuyResult.signature || null,
          amount_sol: halfBuyAmount,
          created_at: new Date().toISOString()
        }]);

        if (targetBuyResult.success && targetBuyResult.signature) {
          await waitForConfirmation(targetBuyResult.signature, 10000);
        }
        
        await new Promise(resolve => setTimeout(resolve, TRANSACTION_DELAY));
      } else {
        results.errors.push('TARGET_TOKEN_CA not configured');
      }

      // Buy the token's own coin (50%)
      if (token?.mint_address) {
        const selfBuyResult = await executeBuy(wallet.api_key, token.mint_address, halfBuyAmount);
        results.selfTokenBuy = {
          tokenMint: token.mint_address,
          tokenName: token.name,
          amountSol: halfBuyAmount,
          ...selfBuyResult
        };

        await supabase.from('wallet_activities').insert([{
          wallet_id: wallet.id,
          activity_type: selfBuyResult.success ? 'buy_self_token' : 'buy_self_token_failed',
          activity_description: selfBuyResult.success 
            ? `Bought ${token.name} with ${halfBuyAmount.toFixed(6)} SOL (from claimed fees)`
            : `Failed to buy ${token.name}: ${selfBuyResult.error}`,
          token_name: token.name,
          transaction_signature: selfBuyResult.signature || null,
          amount_sol: halfBuyAmount,
          created_at: new Date().toISOString()
        }]);
      }
    }

    // Get final balance
    await new Promise(resolve => setTimeout(resolve, 2000));
    const finalBalance = await getWalletBalance(wallet.public_key);
    results.balanceAfter = finalBalance / LAMPORTS_PER_SOL;

    // Update wallet record
    await supabase
      .from('secure_wallets')
      .update({ 
        last_fee_collection: new Date().toISOString()
      })
      .eq('id', wallet.id);

  } catch (error) {
    console.error(`Error processing wallet ${wallet.public_key}:`, error);
    results.errors.push(error.message);
  }

  return results;
}

export async function GET(request) {
  const startTime = Date.now();
  
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('=== Starting Fee Collection Cron ===');
    console.log(`Target token: ${TARGET_TOKEN_CA || 'NOT SET'}`);
    console.log(`Target token name: ${TARGET_TOKEN_NAME}`);
    console.log(`Min claimed to buy: ${MIN_CLAIMED_TO_BUY} SOL`);
    console.log(`Timestamp: ${new Date().toISOString()}`);

    const { data: wallets, error: walletsError } = await supabase
      .from('secure_wallets')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (walletsError) {
      throw new Error(`Failed to fetch wallets: ${walletsError.message}`);
    }

    if (!wallets || wallets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active wallets to process',
        processed: 0
      });
    }

    console.log(`Found ${wallets.length} active wallets`);

    const { data: tokens } = await supabase
      .from('tokens')
      .select('wallet_id, mint_address, name, symbol')
      .not('wallet_id', 'is', null);

    const walletTokenMap = {};
    if (tokens) {
      tokens.forEach(token => {
        walletTokenMap[token.wallet_id] = token;
      });
    }

    const results = [];
    let stats = { processed: 0, claimed: 0, bought: 0, skipped: 0, belowMinimum: 0, errors: 0 };

    for (const wallet of wallets) {
      const token = walletTokenMap[wallet.id];
      console.log(`\n--- Processing: ${token?.name || 'Unknown'} (${wallet.public_key.slice(0, 8)}...) ---`);
      
      const result = await processWallet(wallet, token);
      results.push(result);

      // Update stats
      if (result.feeClaim?.claimed) stats.claimed++;
      if (result.targetTokenBuy?.success || result.selfTokenBuy?.success) {
        stats.bought++;
        stats.processed++;
      } else if (result.errors.some(e => e.includes('below minimum'))) {
        stats.belowMinimum++;
      } else if (result.errors.some(e => e.includes('No fees claimed') || e.includes('Insufficient'))) {
        stats.skipped++;
      } else if (result.errors.length > 0) {
        stats.errors++;
      }

      await new Promise(resolve => setTimeout(resolve, WALLET_DELAY));
    }

    const duration = Date.now() - startTime;

    const summary = {
      success: true,
      duration: `${duration}ms`,
      totalWallets: wallets.length,
      ...stats,
      minClaimedToBuy: `${MIN_CLAIMED_TO_BUY} SOL`,
      targetToken: TARGET_TOKEN_CA || 'Not configured',
      targetTokenName: TARGET_TOKEN_NAME,
      timestamp: new Date().toISOString()
    };

    console.log('\n=== Fee Collection Complete ===');
    console.log(summary);

    return NextResponse.json({ ...summary, results });

  } catch (error) {
    console.error('Fee collection cron error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}