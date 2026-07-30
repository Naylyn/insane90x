// config.js
// Filled in automatically by the GitHub Actions deploy workflow from
// repository secrets/variables. For local testing, copy this file and
// fill in your own project's values (see the setup guide).
window.SUPABASE_CONFIG = {
  url: "__SUPABASE_URL__",
  anonKey: "__SUPABASE_ANON_KEY__",
  // Which Supabase Storage bucket fit-test comparison photos upload to.
  photoBucket: "insane90x-photos"
};
