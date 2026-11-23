// Supabase connection. The publishable key is safe to expose: row-level security
// ensures each signed-in user can only read and write their own rows.
// Leave empty to configure from the app (Profile → Account & sync).
window.FT_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',
};
