import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Keypair, Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Solana connection
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

// Rate limiting constants
const RATE_LIMIT_MINUTES = 7;
const RATE_LIMIT_MS = RATE_LIMIT_MINUTES * 60 * 1000; // 7 minutes in milliseconds

// Fee account rate limiting constants
const FEE_ACCOUNT_DAILY_LIMIT = 2;
const FEE_ACCOUNT_RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Funding constants (in lamports to avoid floating point issues)
const BASE_FUNDING_LAMPORTS = 25_000_000; // 0.025 SOL
const FIRST_TOKEN_BONUS_LAMPORTS = 50_000_000; // 0.05 SOL
const FIRST_TOKEN_DEV_BUY_SOL = 0.04;

// Helper function to get client IP address
function getClientIP(request) {
  // Try multiple headers in order of preference
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip'); // Cloudflare
  
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, get the first one
    return forwardedFor.split(',')[0].trim();
  }
  
  if (cfConnectingIP) return cfConnectingIP;
  if (realIP) return realIP;
  
  return 'unknown';
}

// Rate limiting check function for IP
async function checkRateLimit(clientIP) {
  const now = new Date();
  const rateLimitCutoff = new Date(now.getTime() - RATE_LIMIT_MS);

  try {
    // Check for recent token creations from this IP
    const { data: recentTokens, error } = await supabase
      .from('tokens')
      .select('created_at')
      .eq('creator_ip', clientIP)
      .gte('created_at', rateLimitCutoff.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Rate limit check error:', error);
      // If we can't check rate limit, allow the request but log the error
      return { allowed: true, error: 'Rate limit check failed' };
    }

    if (recentTokens && recentTokens.length > 0) {
      const lastCreation = new Date(recentTokens[0].created_at);
      const timeSinceLastCreation = now - lastCreation;
      const remainingTime = RATE_LIMIT_MS - timeSinceLastCreation;

      return {
        allowed: false,
        remainingTime: Math.ceil(remainingTime / 1000 / 60), // Convert to minutes
        lastCreation: lastCreation.toISOString()
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true, error: 'Rate limit check failed' };
  }
}

// New function to check fee account rate limiting
async function checkFeeAccountRateLimit(feeAccount) {
  if (!feeAccount || feeAccount.trim() === '') {
    return { allowed: true };
  }

  const now = new Date();
  const dailyRateLimitCutoff = new Date(now.getTime() - FEE_ACCOUNT_RATE_LIMIT_MS);

  try {
    // Normalize fee account (remove @ symbol and convert to lowercase for comparison)
    const normalizedFeeAccount = feeAccount.replace('@', '').toLowerCase();

    // Check for recent token creations for this fee account in the last 24 hours
    const { data: recentTokens, error } = await supabase
      .from('tokens')
      .select('created_at, fee_account')
      .not('fee_account', 'is', null)
      .gte('created_at', dailyRateLimitCutoff.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fee account rate limit check error:', error);
      // If we can't check rate limit, allow the request but log the error
      return { allowed: true, error: 'Fee account rate limit check failed' };
    }

    // Filter tokens that match the normalized fee account
    const matchingTokens = recentTokens?.filter(token => {
      if (!token.fee_account) return false;
      const normalizedDbFeeAccount = token.fee_account.replace('@', '').toLowerCase();
      return normalizedDbFeeAccount === normalizedFeeAccount;
    }) || [];

    if (matchingTokens.length >= FEE_ACCOUNT_DAILY_LIMIT) {
      // Find the oldest token creation to calculate when the limit resets
      const oldestTokenTime = new Date(matchingTokens[matchingTokens.length - 1].created_at);
      const resetTime = new Date(oldestTokenTime.getTime() + FEE_ACCOUNT_RATE_LIMIT_MS);
      const hoursUntilReset = Math.ceil((resetTime - now) / (1000 * 60 * 60));

      return {
        allowed: false,
        currentCount: matchingTokens.length,
        dailyLimit: FEE_ACCOUNT_DAILY_LIMIT,
        hoursUntilReset: Math.max(1, hoursUntilReset), // At least 1 hour
        resetTime: resetTime.toISOString(),
        feeAccount: feeAccount
      };
    }

    return { 
      allowed: true, 
      currentCount: matchingTokens.length,
      dailyLimit: FEE_ACCOUNT_DAILY_LIMIT 
    };
  } catch (error) {
    console.error('Fee account rate limit check error:', error);
    return { allowed: true, error: 'Fee account rate limit check failed' };
  }
}

// Check if this is the first token in the database
async function isFirstToken() {
  try {
    const { count, error } = await supabase
      .from('tokens')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('First token check error:', error);
      return false; // Default to not first token if we can't check
    }

    return count === 0;
  } catch (error) {
    console.error('First token check error:', error);
    return false;
  }
}

export async function POST(request) {
  let walletId = null; // Track wallet ID for logging activities
  
  try {
    // Get client IP for rate limiting
    const clientIP = getClientIP(request);
    console.log('Request from IP:', clientIP);

    const formData = await request.formData();
    
    // Extract form data
    const tokenData = {
      name: formData.get('name'),
      symbol: formData.get('symbol'),
      description: formData.get('description') || '',
      twitter: formData.get('twitter') || '',
      telegram: formData.get('telegram') || '',
      website: formData.get('website') || '',
      directFeesTo: formData.get('directFeesTo') || '',
      image: formData.get('image')
    };

    // Validate required fields
    if (!tokenData.name || !tokenData.symbol) {
      return NextResponse.json(
        { error: 'Name and symbol are required' },
        { status: 400 }
      );
    }

    // Check IP-based rate limit first
    const rateLimitResult = await checkRateLimit(clientIP);
    
    if (!rateLimitResult.allowed) {
      console.log(`IP rate limit exceeded for IP: ${clientIP}, remaining time: ${rateLimitResult.remainingTime} minutes`);
      
      return NextResponse.json(
        { 
          error: `Rate limit exceeded. You can create another token in ${rateLimitResult.remainingTime} minutes.`,
          rateLimited: true,
          rateLimitType: 'ip',
          remainingMinutes: rateLimitResult.remainingTime,
          lastCreation: rateLimitResult.lastCreation
        },
        { status: 429 } // Too Many Requests
      );
    }

    // Check fee account rate limit if fee account is provided
    const feeAccountRateLimitResult = await checkFeeAccountRateLimit(tokenData.directFeesTo);
    
    if (!feeAccountRateLimitResult.allowed) {
      console.log(`Fee account rate limit exceeded for: ${tokenData.directFeesTo}, tokens created: ${feeAccountRateLimitResult.currentCount}/${feeAccountRateLimitResult.dailyLimit}`);
      
      return NextResponse.json(
        { 
          error: `Daily limit exceeded for ${feeAccountRateLimitResult.feeAccount}. This account has created ${feeAccountRateLimitResult.currentCount}/${feeAccountRateLimitResult.dailyLimit} tokens today. Try again in ${feeAccountRateLimitResult.hoursUntilReset} hours.`,
          rateLimited: true,
          rateLimitType: 'feeAccount',
          feeAccount: feeAccountRateLimitResult.feeAccount,
          currentCount: feeAccountRateLimitResult.currentCount,
          dailyLimit: feeAccountRateLimitResult.dailyLimit,
          hoursUntilReset: feeAccountRateLimitResult.hoursUntilReset,
          resetTime: feeAccountRateLimitResult.resetTime
        },
        { status: 429 } // Too Many Requests
      );
    }

    if (rateLimitResult.error) {
      console.warn('Rate limit check warning:', rateLimitResult.error);
    }

    if (feeAccountRateLimitResult.error) {
      console.warn('Fee account rate limit check warning:', feeAccountRateLimitResult.error);
    }

    // Check if this is the first token
    const firstToken = await isFirstToken();
    console.log('Is first token:', firstToken);

    const fundingWalletPrivateKey = process.env.FUNDING_WALLET_PRIVATE_KEY;

    if (!fundingWalletPrivateKey) {
      return NextResponse.json(
        { error: 'Funding wallet private key not configured' },
        { status: 500 }
      );
    }

    console.log('Starting secure wallet creation and token launch process...');
    
    // Step 1: Create a new wallet using PumpPortal
    console.log('Creating new secure wallet with PumpPortal...');
    
    const createWalletResponse = await fetch('https://pumpportal.fun/api/create-wallet', {
      method: 'GET',
    });

    if (!createWalletResponse.ok) {
      const errorText = await createWalletResponse.text();
      console.error('Wallet creation failed:', errorText);
      throw new Error(`Failed to create wallet: ${createWalletResponse.status} - ${errorText}`);
    }

    const walletResult = await createWalletResponse.json();
    console.log('Wallet creation result (public key only):', { publicKey: walletResult.publicKey });

    if (!walletResult.walletPublicKey || !walletResult.privateKey || !walletResult.apiKey) {
      throw new Error('Invalid wallet creation response - missing required fields');
    }

    // Step 2: IMMEDIATELY save wallet securely to database
    const walletInfo = {
      public_key: walletResult.walletPublicKey,
      private_key: walletResult.privateKey,
      api_key: walletResult.apiKey,
      initial_balance_sol: 0,
      created_at: new Date().toISOString(),
      creator_ip: clientIP, // Use the extracted IP
      is_active: true,
      notes: `Created for token: ${tokenData.name} (${tokenData.symbol})${firstToken ? ' [FIRST TOKEN - BONUS FUNDING]' : ''}`
    };

    console.log('Saving secure wallet to database...');
    
    const { data: savedWallet, error: walletError } = await supabase
      .from('secure_wallets')
      .insert([walletInfo])
      .select()
      .single();

    if (walletError) {
      console.error('Secure wallet save error:', walletError);
      throw new Error('Failed to securely store wallet credentials');
    }

    walletId = savedWallet.id;
    console.log('Secure wallet saved with ID:', walletId);

    // Log wallet creation activity
    await supabase.from('wallet_activities').insert([{
      wallet_id: walletId,
      activity_type: 'created',
      activity_description: `Wallet created for token ${tokenData.name} (${tokenData.symbol})${firstToken ? ' [FIRST TOKEN]' : ''}`,
      created_at: new Date().toISOString()
    }]);

    // Step 3: Fund the new wallet (extra funding for first token)
    const fundingLamports = firstToken 
      ? BASE_FUNDING_LAMPORTS + FIRST_TOKEN_BONUS_LAMPORTS  // 75,000,000 lamports (0.075 SOL) for first token
      : BASE_FUNDING_LAMPORTS;  // 25,000,000 lamports (0.025 SOL) normally
    
    const fundingAmountSol = fundingLamports / LAMPORTS_PER_SOL;
    console.log(`Funding new wallet with ${fundingAmountSol} SOL...${firstToken ? ' (includes first token bonus)' : ''}`);
    
    const fundingKeypair = Keypair.fromSecretKey(bs58.decode(fundingWalletPrivateKey));
    const newWalletPubkey = new PublicKey(walletResult.walletPublicKey);
    
    const fundingTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fundingKeypair.publicKey,
        toPubkey: newWalletPubkey,
        lamports: fundingLamports,
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    fundingTransaction.recentBlockhash = blockhash;
    fundingTransaction.feePayer = fundingKeypair.publicKey;

    fundingTransaction.sign(fundingKeypair);
    const fundingSignature = await connection.sendRawTransaction(fundingTransaction.serialize());
    
    console.log('Funding transaction signature:', fundingSignature);
    
    await connection.confirmTransaction(fundingSignature, 'confirmed');
    console.log('Wallet funded successfully');

    // Update wallet with funding info
    await supabase
      .from('secure_wallets')
      .update({ 
        funding_transaction: fundingSignature,
        initial_balance_sol: fundingAmountSol
      })
      .eq('id', walletId);

    // Log funding activity
    await supabase.from('wallet_activities').insert([{
      wallet_id: walletId,
      activity_type: 'funded',
      activity_description: `Wallet funded with ${fundingAmountSol} SOL${firstToken ? ' (includes first token bonus)' : ''}`,
      transaction_signature: fundingSignature,
      amount_sol: fundingAmountSol,
      created_at: new Date().toISOString()
    }]);

    // Step 4: Generate mint keypair and upload metadata
    const mintKeypair = Keypair.generate();
    console.log('Generated mint keypair:', mintKeypair.publicKey.toString());
    
    // Determine Twitter URL for metadata - use provided or fallback to fee account profile
    let metadataTwitterUrl = tokenData.twitter;
    if (!metadataTwitterUrl && tokenData.directFeesTo) {
      // Remove @ symbol from directFeesTo for Twitter URL
      const handle = tokenData.directFeesTo.replace('@', '');
      metadataTwitterUrl = `https://x.com/${handle}`;
    }
    
    const metadataFormData = new FormData();
    metadataFormData.append('name', tokenData.name);
    metadataFormData.append('symbol', tokenData.symbol);
    metadataFormData.append('description', tokenData.description);
    metadataFormData.append('twitter', tokenData.twitter);
    metadataFormData.append('telegram', tokenData.telegram);
    // Use custom token link instead of user's website for metadata
    metadataFormData.append('website', tokenData.website);
    metadataFormData.append('showName', 'true');
    
    if (tokenData.image && tokenData.image.size > 0) {
      metadataFormData.append('file', tokenData.image);
    }

    console.log('Uploading metadata to IPFS...');
    const metadataResponse = await fetch('https://pump.fun/api/ipfs', {
      method: 'POST',
      body: metadataFormData
    });
    
    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      console.error('Metadata upload failed:', errorText);
      throw new Error(`Failed to upload metadata to IPFS: ${metadataResponse.status} - ${errorText}`);
    }

    const metadataResult = await metadataResponse.json();

    if (!metadataResult.metadataUri) {
      throw new Error('No metadata URI returned from IPFS upload');
    }

    // Step 5: Create the token using the secure wallet's API key
    // For first token, include initial dev buy of 0.04 SOL
    const devBuyAmount = firstToken ? FIRST_TOKEN_DEV_BUY_SOL : 0;
    
    const createTokenPayload = {
      action: 'create',
      tokenMetadata: {
        name: tokenData.name,
        symbol: tokenData.symbol,
        uri: metadataResult.metadataUri
      },
      mint: bs58.encode(mintKeypair.secretKey),
      denominatedInSol: 'true',
      amount: devBuyAmount, // 0.04 SOL for first token, 0 otherwise
      slippage: 10,
      priorityFee: 0.0001,
      pool: 'pump'
    };

    console.log(`Creating token with secure wallet...${firstToken ? ` (with ${devBuyAmount} SOL dev buy)` : ''}`);

    const createResponse = await fetch(`https://pumpportal.fun/api/trade?api-key=${walletResult.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createTokenPayload)
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Token creation failed:', errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      if (errorData.errors && Array.isArray(errorData.errors)) {
        const errorMessages = errorData.errors.join(', ');
        throw new Error(`API Validation Error: ${errorMessages}`);
      }
      
      throw new Error(errorData.message || `Failed to create token: ${createResponse.status} - ${errorText}`);
    }

    const result = await createResponse.json();

    if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
      const errorMessages = result.errors.join(', ');
      throw new Error(`API Validation Error: ${errorMessages}`);
    }

    if (!result || typeof result !== 'object' || Object.keys(result).length === 0) {
      throw new Error('Invalid response from token creation API');
    }

    // Get image URI
    let imageUri = metadataResult.image || null;
    if (!imageUri && metadataResult.metadataUri) {
      try {
        const metadataFetch = await fetch(metadataResult.metadataUri);
        if (metadataFetch.ok) {
          const metadataFromUri = await metadataFetch.json();
          imageUri = metadataFromUri.image || null;
        }
      } catch (error) {
        console.warn('Failed to fetch metadata from URI:', error.message);
      }
    }

    // Step 6: Save token info (NON-sensitive data only)
    const tokenInfo = {
      name: tokenData.name,
      symbol: tokenData.symbol,
      description: tokenData.description || null,
      mint_address: result.mint || result.mintAddress || result.token || result.tokenAddress || mintKeypair.publicKey.toString(),
      transaction_signature: result.signature || result.txSignature || result.transaction || result.hash || 'Unknown',
      metadata_uri: metadataResult.metadataUri,
      image_uri: imageUri,
      fee_account: tokenData.directFeesTo || null,
      twitter_url: tokenData.twitter || null,
      telegram_url: tokenData.telegram || null,
      website_url: tokenData.website || null,
      status: 'created',
      raw_response: result,
      // Safe wallet reference (no sensitive data)
      wallet_id: walletId,
      wallet_public_key: walletResult.walletPublicKey, // Safe to store public key
      creator_ip: clientIP, // Use the extracted IP
      created_at: new Date().toISOString() // Ensure we have creation timestamp for rate limiting
    };

    const { data: savedToken, error: tokenError } = await supabase
      .from('tokens')
      .insert([tokenInfo])
      .select()
      .single();

    if (tokenError) {
      console.error('Token save error:', tokenError);
      console.warn('Token created successfully but failed to save to database');
    }

    // Log token launch activity
    if (savedToken) {
      await supabase.from('wallet_activities').insert([{
        wallet_id: walletId,
        activity_type: 'token_launched',
        activity_description: `Token launched: ${tokenData.name} (${tokenData.symbol})${firstToken ? ` with ${devBuyAmount} SOL dev buy` : ''}`,
        transaction_signature: tokenInfo.transaction_signature,
        amount_sol: devBuyAmount > 0 ? devBuyAmount : null,
        created_at: new Date().toISOString()
      }]);

      // Update secure wallet with associated token
      await supabase
        .from('secure_wallets')
        .update({ 
          notes: `Token launched: ${tokenData.name} (${tokenData.symbol}) - Mint: ${tokenInfo.mint_address}${firstToken ? ' [FIRST TOKEN]' : ''}`
        })
        .eq('id', walletId);
    }

    // Return success response (NO sensitive wallet data)
    return NextResponse.json({
      success: true,
      wallet: {
        id: walletId,
        publicKey: walletResult.walletPublicKey, // Safe to return
        fundingSignature: fundingSignature,
        fundingAmount: fundingAmountSol
        // NOTE: privateKey and apiKey are NOT returned for security
      },
      token: {
        id: savedToken?.id || null,
        signature: tokenInfo.transaction_signature,
        mint: tokenInfo.mint_address,
        metadataUri: tokenInfo.metadata_uri,
        imageUri: tokenInfo.image_uri,
        tokenName: tokenInfo.name,
        tokenSymbol: tokenInfo.symbol,
        walletUsed: walletResult.walletPublicKey,
        rawResponse: result,
        isFirstToken: firstToken,
        devBuyAmount: devBuyAmount
      },
      // Include rate limit status for fee account
      rateLimitStatus: {
        feeAccount: tokenData.directFeesTo,
        currentCount: (feeAccountRateLimitResult.currentCount || 0) + 1, // Add 1 for the token just created
        dailyLimit: feeAccountRateLimitResult.dailyLimit
      }
    });

  } catch (error) {
    console.error('Token creation error:', error);
    
    // Log error activity if we have a wallet ID
    if (walletId) {
      try {
        await supabase.from('wallet_activities').insert([{
          wallet_id: walletId,
          activity_type: 'error',
          activity_description: `Error during token creation: ${error.message}`,
          created_at: new Date().toISOString()
        }]);
      } catch (logError) {
        console.error('Failed to log error activity:', logError);
      }
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'An error occurred while creating the wallet and token' 
      },
      { status: 500 }
    );
  }
}