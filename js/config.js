/**
 * config.js
 * ---------------------------------------------------------------------------
 * Zugangsdaten für die Cloud-Synchronisierung über Supabase (ab 1.4).
 * Beide Werte findest du im Supabase-Dashboard deines Projekts (siehe
 * SETUP.md, Schritt 5). Bleiben sie leer, läuft die App wie bisher rein
 * lokal im Browser.
 *
 * Diese Werte sind NICHT geheim: der "publishable"/"anon"-Schlüssel ist dafür
 * gedacht, im Browser zu stehen. Geschützt werden deine Daten durch den Login
 * und die Row-Level-Security-Regeln in der Datenbank (supabase/setup.sql).
 * ---------------------------------------------------------------------------
 */

// Projekt-URL, z.B. 'https://abcdefghijklmnop.supabase.co'
export const SUPABASE_URL = 'https://cqvdapjvklvonxofjcaz.supabase.co';

// Publishable key ('sb_publishable_...') oder - bei älteren Projekten - der anon key
export const SUPABASE_KEY = 'sb_publishable_3lBCKMSJnRem_…';
