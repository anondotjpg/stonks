// api/tokens/[mint_address]/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET /api/tokens/[mint_address] - Fetch a specific token by mint address
export async function GET(request, { params }) {
  try {
    // In Next.js 15, params is a Promise
    const { mint_address } = await params;

    if (!mint_address) {
      return NextResponse.json(
        { error: 'Mint address is required' }, 
        { status: 400 }
      );
    }

    const { data: token, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('mint_address', mint_address)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Token not found' }, 
          { status: 404 }
        );
      }
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: error.message }, 
        { status: 500 }
      );
    }

    return NextResponse.json({ token });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}