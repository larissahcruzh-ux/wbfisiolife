import { createClient } from '@supabase/supabase-js';

// Colocando as chaves direto como texto (sempre entre aspas simples ou duplas!)
const supabaseUrl = 'https://agpfsciphsggayeanmni.supabase.co';
const supabaseKey = 'sb_publishable_FCr7raOcnIh8rO6IHXFuMQ_tgzEfNy9';

export const supabase = createClient(supabaseUrl, supabaseKey);