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
const MIN_BALANCE_TO_PROCESS = 0.003 * LAMPORTS_PER_SOL;
const RESERVE_FOR_FEES = 0.002 * LAMPORTS_PER_SOL;
const BUY_SLIPPAGE = 15;
const PRIORITY_FEE = 0.0001;

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.warn('CRON_SECRET not configured');
    return false;
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}

// Get wallet SOL balance
async function getWalletBalance(publicKey) {
  try {
    const balance = await connection.getBalance(new PublicKey(publicKey));
    return balance;
  } catch (error) {
    console.error(`Failed to get balance for ${publicKey}:`, error.message);
    return 0;
  }
}

async function claimCreatorFees(apiKey, mintAddress = null) {
  try {
    console.log(`Claiming creator fees...`);

    const payload = {
      action: "collectCreatorFee",
      priorityFee: PRIORITY_FEE,
      pool: "pump"  // Use "meteora-dbc" for Meteora tokens
    };
    
    // Only needed for meteora-dbc, optional for pump
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
          message: 'No fees available to claim'
        };
      }
      
      throw new Error(`Claim failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    return {
      success: true,
      claimed: true,
      signature: result.signature || result.txSignature,
      amount: result.amount || result.claimedAmount,
      result
    };
  } catch (error) {
    console.error(`Fee claim failed:`, error.message);
    return {
      success: false,
      claimed: false,
      error: error.message
    };
  }
}

// Execute a buy order via PumpPortal
async function executeBuy(apiKey, mintAddress, amountSol) {
  try {
    const buyPayload = {
      action: 'buy',
      mint: mintAddress,
      amount: amountSol,
      denominatedInSol: 'true',
      slippage: BUY_SLIPPAGE,
      priorityFee: PRIORITY_FEE,
      pool: 'pump'
    };

    console.log(`Executing buy: ${amountSol} SOL for ${mintAddress}`);

    const response = await fetch(`https://pumpportal.fun/api/trade?api-key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buyPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Buy failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
      throw new Error(`Buy validation error: ${result.errors.join(', ')}`);
    }

    return {
      success: true,
      signature: result.signature || result.txSignature || result.transaction,
      result
    };
  } catch (error) {
    console.error(`Buy execution failed for ${mintAddress}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Process a single wallet
async function processWallet(wallet, token) {
  const results = {
    walletId: wallet.id,
    walletPublicKey: wallet.public_key,
    tokenMint: token?.mint_address,
    tokenName: token?.name,
    balanceBefore: 0,
    balanceAfter: 0,
    feeClaim: null,
    targetTokenBuy: null,
    selfTokenBuy: null,
    errors: []
  };

  try {
    // Step 1: Get initial balance
    const balanceBefore = await getWalletBalance(wallet.public_key);
    results.balanceBefore = balanceBefore / LAMPORTS_PER_SOL;
    console.log(`Wallet ${wallet.public_key.slice(0, 8)}...: Initial balance = ${results.balanceBefore} SOL`);

    // Step 2: Claim creator fees (if token exists)
    if (token?.mint_address) {
      const claimResult = await claimCreatorFees(wallet.api_key, token.mint_address);
      results.feeClaim = claimResult;

      if (claimResult.success && claimResult.claimed) {
        console.log(`Claimed fees for ${token.name}: ${claimResult.amount || 'unknown amount'} SOL`);
        
        // Log claim activity
        await supabase.from('wallet_activities').insert([{
          wallet_id: wallet.id,
          activity_type: 'fee_claimed',
          activity_description: `Claimed creator fees for ${token.name}`,
          transaction_signature: claimResult.signature || null,
          amount_sol: claimResult.amount || null,
          created_at: new Date().toISOString()
        }]);

        // Wait for transaction to confirm
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else if (!claimResult.success) {
        results.errors.push(`Fee claim failed: ${claimResult.error}`);
      }
    } else {
      results.errors.push('No associated token found - skipping fee claim');
    }

    // Step 3: Get updated balance after claiming
    const balanceAfterClaim = await getWalletBalance(wallet.public_key);
    results.balanceAfter = balanceAfterClaim / LAMPORTS_PER_SOL;
    console.log(`Balance after claim: ${results.balanceAfter} SOL`);

    // Step 4: Check if we have enough balance to process buys
    if (balanceAfterClaim < MIN_BALANCE_TO_PROCESS) {
      results.errors.push(`Insufficient balance for buys: ${results.balanceAfter} SOL (min: ${MIN_BALANCE_TO_PROCESS / LAMPORTS_PER_SOL} SOL)`);
      return results;
    }

    // Step 5: Calculate available balance for buys
    const availableBalance = balanceAfterClaim - RESERVE_FOR_FEES;
    
    if (availableBalance <= 0) {
      results.errors.push('No balance available after reserving for fees');
      return results;
    }

    // Split 50/50
    const halfBalanceSol = (availableBalance / 2) / LAMPORTS_PER_SOL;
    console.log(`Available for buys: ${(availableBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL (${halfBalanceSol.toFixed(6)} SOL each)`);

    // Step 6: Buy target token (50%)
    if (TARGET_TOKEN_CA) {
      const targetBuyResult = await executeBuy(wallet.api_key, TARGET_TOKEN_CA, halfBalanceSol);
      results.targetTokenBuy = {
        tokenMint: TARGET_TOKEN_CA,
        amountSol: halfBalanceSol,
        ...targetBuyResult
      };

      await supabase.from('wallet_activities').insert([{
        wallet_id: wallet.id,
        activity_type: targetBuyResult.success ? 'buy_target_token' : 'buy_target_token_failed',
        activity_description: targetBuyResult.success 
          ? `Bought target token with ${halfBalanceSol} SOL`
          : `Failed to buy target token: ${targetBuyResult.error}`,
        transaction_signature: targetBuyResult.signature || null,
        amount_sol: halfBalanceSol,
        created_at: new Date().toISOString()
      }]);

      // Wait between transactions
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      results.errors.push('TARGET_TOKEN_CA not configured');
    }

    // Step 7: Buy the token's own coin (50%)
    if (token?.mint_address) {
      const selfBuyResult = await executeBuy(wallet.api_key, token.mint_address, halfBalanceSol);
      results.selfTokenBuy = {
        tokenMint: token.mint_address,
        tokenName: token.name,
        amountSol: halfBalanceSol,
        ...selfBuyResult
      };

      await supabase.from('wallet_activities').insert([{
        wallet_id: wallet.id,
        activity_type: selfBuyResult.success ? 'buy_self_token' : 'buy_self_token_failed',
        activity_description: selfBuyResult.success 
          ? `Bought own token (${token.name}) with ${halfBalanceSol} SOL`
          : `Failed to buy own token: ${selfBuyResult.error}`,
        transaction_signature: selfBuyResult.signature || null,
        amount_sol: halfBalanceSol,
        created_at: new Date().toISOString()
      }]);
    }

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
  
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('=== Starting Fee Collection Cron ===');
    console.log(`Target token: ${TARGET_TOKEN_CA || 'NOT SET'}`);

    // Fetch all active wallets
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

    // Fetch tokens to map wallet_id -> token
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

    // Process each wallet
    const results = [];
    let stats = { processed: 0, claimed: 0, bought: 0, skipped: 0, errors: 0 };

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
      } else if (result.errors.some(e => e.includes('Insufficient'))) {
        stats.skipped++;
      } else if (result.errors.length > 0) {
        stats.errors++;
      }

      // Delay between wallets
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const duration = Date.now() - startTime;

    const summary = {
      success: true,
      duration: `${duration}ms`,
      totalWallets: wallets.length,
      ...stats,
      targetToken: TARGET_TOKEN_CA || 'Not configured',
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