  -- ── WhatsApp Sessions ──────────────────────────────────────────────────                                            
   -- Drop in child-first order (whatsapp_messages has FK into whatsapp_sessions)                                        
  DROP TABLE IF EXISTS whatsapp_messages;                                                                               
  DROP TABLE IF EXISTS whatsapp_sessions;                                                                               
                                                                                                                        
  -- whatsapp_sessions (unchanged structure, included for clean recreate)                                               
  CREATE TABLE whatsapp_sessions (                                                                                      
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                                                                      
    phone_number VARCHAR NOT NULL,                          
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
    is_new_creator BOOLEAN NOT NULL DEFAULT false,                                                                      
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    source_channel VARCHAR(30),                                                                                         
    turns_count INTEGER NOT NULL DEFAULT 0,                 
    last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),                                                                  
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),                                                                        
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()                                                                         
  );                                                                                                                    
                                                            
  CREATE INDEX idx_wa_sessions_phone_status                                                                             
    ON whatsapp_sessions (phone_number, status);            
                                                                                                                        
  -- whatsapp_messages (media_urls -> media_items, plus unique (session_id, turn_index))                                
  CREATE TABLE whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                                                                      
    session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,                                        
    turn_index INTEGER NOT NULL,                                                                                        
    role VARCHAR(10) NOT NULL,                                                                                          
    content TEXT NOT NULL,                                                                                              
    media_items JSONB NOT NULL DEFAULT '[]'::jsonb,         
    llm_model VARCHAR(50),                                                                                              
    llm_latency_ms INTEGER,                                                                                             
    input_tokens INTEGER,                                                                                               
    output_tokens INTEGER,                                                                                              
    created_at TIMESTAMP NOT NULL DEFAULT NOW()             
  );                                                                                                                    
   

  CREATE INDEX idx_wa_messages_session
    ON whatsapp_messages (session_id);

  CREATE UNIQUE INDEX uq_wa_messages_session_turn
    ON whatsapp_messages (session_id, turn_index);
  
  ---               


  next run this

   -- Add source_channel to profiles                                                                                     
  ALTER TABLE profiles                                            
    ADD COLUMN IF NOT EXISTS source_channel varchar(30);                                                                
                                                                                                                        
  -- Add source_channel to events
  ALTER TABLE events                                                                                                    
    ADD COLUMN IF NOT EXISTS source_channel varchar(30);          
                                                                                                                        

  -- supabase
    CREATE OR REPLACE FUNCTION get_profile_by_phone(phone_number text)
  RETURNS text AS $$                                                                                                    
    SELECT p.id                                                   
    FROM auth.users u
    JOIN profiles p ON p.id = u.id::text
    WHERE u.phone = phone_number        
    LIMIT 1;
  $$ LANGUAGE sql SECURITY DEFINER;
