const SUPABASE_URL = 'https://jdhsnfjqmixaywphlqdc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_mx8a_8WtYpUModWJG5GFJA_wlT8nKGF';

let _supabase = null;
try {
    if (window.supabase && window.supabase.createClient) {
        _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[RuralX] Supabase client ready.');
    } else {
        console.warn('[RuralX] Supabase SDK not loaded.');
    }
} catch (err) {
    console.error('[RuralX] Supabase init error:', err);
}

/* ════════════════════════════════════
   AUTH HELPERS
════════════════════════════════════ */
async function getSession() {
    if (!_supabase) return null;
    const { data: { session } } = await _supabase.auth.getSession();
    return session;
}

async function getCurrentUser() {
    if (!_supabase) return null;
    const { data: { user } } = await _supabase.auth.getUser();
    return user;
}

async function signOut() {
    if (_supabase) await _supabase.auth.signOut();
    window.location.href = '/auth';
}

/* ════════════════════════════════════
   PATIENT ID GENERATOR
════════════════════════════════════ */
function generatePatientId() {
    const year  = new Date().getFullYear();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return `RX-${year}-${s}`;
}

/* ════════════════════════════════════
   AGE CALCULATOR
════════════════════════════════════ */
function calculateAge(dobString) {
    if (!dobString) return null;
    const dob  = new Date(dobString);
    const now  = new Date();
    let age    = now.getFullYear() - dob.getFullYear();
    const m    = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    return age >= 0 ? age : null;
}

/* ════════════════════════════════════
   PROFILE HELPERS
════════════════════════════════════ */
async function getProfile(userId) {
    if (!_supabase) return null;
    const { data, error } = await _supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) { console.error('Profile fetch error:', error); return null; }
    return data;
}

async function createProfile(userId, profileData) {
    if (!_supabase) return null;
    const patient_id = generatePatientId();
    const age = calculateAge(profileData.date_of_birth);
    const { data, error } = await _supabase
        .from('profiles')
        .insert([{ id: userId, patient_id, age, ...profileData }])
        .select()
        .single();
    if (error) { console.error('Profile create error:', error); return null; }
    return data;
}

async function updateProfile(userId, updates) {
    if (!_supabase) return null;
    // Auto-recalculate age if DOB is being updated
    if (updates.date_of_birth) {
        updates.age = calculateAge(updates.date_of_birth);
    }
    const { data, error } = await _supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
    if (error) { console.error('Profile update error:', error); return null; }
    return data;
}

/* ════════════════════════════════════
   SCAN STORAGE
════════════════════════════════════ */

/**
 * Get the most recent scan for this user (for comparison)
 */
async function getPreviousScan() {
    if (!_supabase) return null;
    const user = await getCurrentUser();
    if (!user) return null;
    const { data, error } = await _supabase
        .from('scans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) { console.error('Previous scan fetch error:', error); return null; }
    return data;
}

/**
 * Safely extract a float probability from a scan record.
 * Tries: tb_prob_float (number column) → tb_prob (text column like "0.87") → 0
 */
function _extractProb(scan, floatKey, textKey) {
    if (scan[floatKey] != null && !isNaN(parseFloat(scan[floatKey]))) return parseFloat(scan[floatKey]);
    if (scan[textKey]  != null && !isNaN(parseFloat(scan[textKey])))  return parseFloat(scan[textKey]);
    return 0;
}

/**
 * Generate health delta: detailed comparison between previous and current scan.
 * Handles old scans that only have text prob fields (no float columns).
 */
function computeHealthDelta(prevScan, currentData) {
    if (!prevScan) return null;

    // Extract probabilities with fallback to text fields
    const prev = {
        tb:        _extractProb(prevScan, 'tb_prob_float', 'tb_prob'),
        pneumonia: _extractProb(prevScan, 'pneumonia_prob_float', 'pneumonia_prob'),
        risk:      prevScan.risk_level || '',
        diagnosis: prevScan.diagnosis  || '',
        confidence: parseFloat(prevScan.confidence || 0),
    };
    const curr = {
        tb:        _extractProb(currentData, 'tb_prob_float', 'tb_prob'),
        pneumonia: _extractProb(currentData, 'pneumonia_prob_float', 'pneumonia_prob'),
        risk:      currentData.risk_level || '',
        diagnosis: currentData.diagnosis  || '',
        confidence: parseFloat(currentData.confidence || 0),
    };

    const RISK_RANK = { ROUTINE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

    const tbDiff   = curr.tb        - prev.tb;
    const pnDiff   = curr.pneumonia - prev.pneumonia;
    const prevRiskRank = RISK_RANK[prev.risk] ?? 0;
    const currRiskRank = RISK_RANK[curr.risk] ?? 0;
    const riskDiff     = currRiskRank - prevRiskRank;

    // Smarter overall trend: considers both probability changes AND risk level
    let score = 0;
    // Disease probability changes (negative = improved)
    score += tbDiff * 2;   // weight TB higher
    score += pnDiff * 1.5;
    // Risk level change
    score += riskDiff * 0.15;
    // Diagnosis change: Normal is best
    if (curr.diagnosis === 'Normal' && prev.diagnosis !== 'Normal') score -= 0.3;
    if (prev.diagnosis === 'Normal' && curr.diagnosis !== 'Normal') score += 0.3;

    const overallTrend = score < -0.02 ? 'IMPROVED'
                       : score >  0.02 ? 'WORSENED'
                       : 'STABLE';

    // Diagnosis changed?
    const diagnosisChanged = prev.diagnosis !== curr.diagnosis;

    // Compute days since last scan
    let daysSince = null;
    if (prevScan.created_at) {
        daysSince = Math.max(0, Math.round((Date.now() - new Date(prevScan.created_at).getTime()) / 86400000));
    }

    // Compare radiological findings if available
    let findingsDelta = [];
    const prevFindings = prevScan.radiological_findings || {};
    const currFindings = currentData.radiological_findings || {};
    const allFindingKeys = new Set([...Object.keys(prevFindings), ...Object.keys(currFindings)]);
    allFindingKeys.forEach(key => {
        const pv = parseFloat(prevFindings[key] || 0);
        const cv = parseFloat(currFindings[key] || 0);
        const change = cv - pv;
        if (Math.abs(change) > 0.01) {
            findingsDelta.push({
                name: key,
                prev_val: +(pv * 100).toFixed(1),
                curr_val: +(cv * 100).toFixed(1),
                change:   +(change * 100).toFixed(1),
                trend:    change < 0 ? 'improved' : 'worsened',
            });
        }
    });
    findingsDelta.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    return {
        prev_diagnosis:     prev.diagnosis,
        curr_diagnosis:     curr.diagnosis,
        diagnosis_changed:  diagnosisChanged,
        prev_tb:            +(prev.tb * 100).toFixed(1),
        curr_tb:            +(curr.tb * 100).toFixed(1),
        tb_change:          +(tbDiff * 100).toFixed(1),
        prev_pneumonia:     +(prev.pneumonia * 100).toFixed(1),
        curr_pneumonia:     +(curr.pneumonia * 100).toFixed(1),
        pneumonia_change:   +(pnDiff * 100).toFixed(1),
        risk_change:        riskDiff,
        prev_risk:          prev.risk,
        curr_risk:          curr.risk,
        overall_trend:      overallTrend,
        trend_score:        +score.toFixed(3),
        days_since_last:    daysSince,
        prev_scan_date:     prevScan.created_at,
        prev_confidence:    prev.confidence,
        curr_confidence:    curr.confidence,
        findings_delta:     findingsDelta,
    };
}

/**
 * Save full scan to Supabase
 */
async function saveScan(scanPayload) {
    if (!_supabase) return null;
    const user = await getCurrentUser();
    if (!user) return null;

    const profile = await getProfile(user.id);

    const { data, error } = await _supabase
        .from('scans')
        .insert([{
            user_id:   user.id,
            patient_id: profile?.patient_id || null,
            ...scanPayload,
            timestamp: new Date().toISOString(),
        }])
        .select()
        .single();

    if (error) { console.error('Scan save error:', error); return null; }
    return data;
}

/**
 * Get all scans for current user
 */
async function getPatientScans(limit = 50) {
    if (!_supabase) return [];
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await _supabase
        .from('scans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) { console.error('Scan fetch error:', error); return []; }
    return data || [];
}

/* ════════════════════════════════════
   SIGN UP / SIGN IN
════════════════════════════════════ */
async function signUp({ email, password, full_name, phone, date_of_birth, patient_id }) {
    if (!_supabase) throw new Error('Auth service unavailable');
    const pid = patient_id || generatePatientId();
    const age = calculateAge(date_of_birth);
    const { data, error } = await _supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name, phone, date_of_birth, patient_id: pid, age }
        }
    });
    if (error) throw error;
    return { ...data, patient_id: pid };
}

async function signIn({ email, password }) {
    if (!_supabase) throw new Error('Auth service unavailable');
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

/* ════════════════════════════════════
   AUTH GUARD
════════════════════════════════════ */
async function requireAuth(redirectTo = '/auth') {
    const session = await getSession();
    if (!session) { window.location.href = redirectTo; return null; }
    return session;
}

/* ── Expose globally ── */
window.RuralXAuth = {
    supabase: _supabase,
    getSession, getCurrentUser, signOut,
    getProfile, createProfile, updateProfile,
    saveScan, getPatientScans, getPreviousScan,
    computeHealthDelta, calculateAge, generatePatientId,
    requireAuth, signUp, signIn,
};
