import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };

export function isSupabaseConfigured() {
  return !!(supabaseUrl && supabaseAnonKey);
}

function getClient() {
  if (!supabase) throw new Error('Supabase is not configured. Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY to your Netlify environment variables.');
  return supabase;
}

// Query by customer_name (the table uses customer_name, not customer_id)
export async function fetchCustomerPricing(customerName) {
  const { data, error } = await getClient()
    .from('customer_pricing')
    .select('*')
    .eq('customer_name', customerName)
    .order('item_number');
  if (error) throw error;
  return data;
}

export async function upsertPricingRow(row) {
  // Explicitly omit any fields not in the table schema
  const { item_id, customer_id, ...safeRow } = row;
  const { data, error } = await getClient()
    .from('customer_pricing')
    .upsert(safeRow, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePricingRow(id) {
  const { error } = await getClient()
    .from('customer_pricing')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function insertPricingRow(row) {
  // Explicitly omit any fields not in the table schema
  const { id, item_id, customer_id, ...safeRow } = row;
  const { data, error } = await getClient()
    .from('customer_pricing')
    .insert(safeRow)
    .select()
    .single();
  if (error) throw error;
  return data;
}
