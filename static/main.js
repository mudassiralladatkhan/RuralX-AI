/* ════════════════════════════════════════════════════════════
   RuralX AI – Enhanced Frontend Logic v2
   Implements Features: 1-9 result rendering, tab navigation,
   metrics dashboard, structured JSON viewer.
   ════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

    // ── State ──

    // ── Drop Zone ──
    const dropZone    = document.getElementById('dropZone');
    const xrayImage   = document.getElementById('xrayImage');
    const imgPreview  = document.getElementById('imagePreview');
    const dropOverlay = document.getElementById('dropOverlay');
    const dropPH      = document.getElementById('dropPlaceholder');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt =>
        dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); })
    );

    ['dragenter', 'dragover'].forEach(evt =>
        dropZone.addEventListener(evt, () => dropZone.classList.add('dragover'))
    );

    ['dragleave', 'drop'].forEach(evt =>
        dropZone.addEventListener(evt, () => dropZone.classList.remove('dragover'))
    );

    dropZone.addEventListener('drop', e => {
        xrayImage.files = e.dataTransfer.files;
        handleFile(e.dataTransfer.files[0]);
    });

    xrayImage.addEventListener('change', function () {
        if (this.files && this.files[0]) handleFile(this.files[0]);
    });

    function handleFile(file) {
        if (!file.type.match('image.*')) { alert('Please upload an image file.'); return; }
        const reader = new FileReader();
        reader.onload = e => {
            imgPreview.src = e.target.result;
            imgPreview.classList.remove('hidden');
            dropPH.classList.add('hidden');
            dropOverlay.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    // ── Pre-Analysis Risk Evaluator ──
    const spo2Input = document.getElementById('spo2');
    const haemoptysisYes = document.querySelector('input[name="haemoptysis"][value="yes"]');
    const feverDays = document.getElementById('fever_days');
    const preRiskStrip = document.getElementById('preRiskStrip');
    const preRiskText = document.getElementById('preRiskText');

    function checkPreRisk() {
        let riskMsgs = [];
        if (spo2Input.value && parseInt(spo2Input.value) < 94) {
            riskMsgs.push(`Low SpO2 (${spo2Input.value}%)`);
        }
        if (haemoptysisYes && haemoptysisYes.checked) {
            riskMsgs.push("Haemoptysis");
        }
        if (feverDays.value && parseInt(feverDays.value) >= 14) {
            riskMsgs.push("Prolonged Fever");
        }
        
        if (riskMsgs.length > 0) {
            preRiskText.textContent = riskMsgs.join(", ");
            preRiskStrip.style.display = 'block';
        } else {
            preRiskStrip.style.display = 'none';
        }
    }

    [spo2Input, feverDays].forEach(el => el && el.addEventListener('input', checkPreRisk));
    document.querySelectorAll('input[name="haemoptysis"]').forEach(el => el.addEventListener('change', checkPreRisk));

    // ── Form Submission & Processing Animation ──
    const form       = document.getElementById('diagnosisForm');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const btnText    = document.getElementById('btnText');
    const btnLoader  = document.getElementById('btnLoader');
    const processingSteps = document.getElementById('processingSteps');

    const resultsPlaceholder = document.getElementById('resultsPlaceholder');
    const resultsContent     = document.getElementById('resultsContent');

    async function runProcessingSteps() {
        processingSteps.style.display = 'block';
        for (let i = 1; i <= 4; i++) {
            const step = document.getElementById(`step${i}`);
            if(step) step.querySelector('.step-icon').textContent = '⏳';
        }

        const delays = [800, 1500, 2200, 2800];
        for (let i = 1; i <= 4; i++) {
            setTimeout(() => {
                const step = document.getElementById(`step${i}`);
                if(step) {
                    step.querySelector('.step-icon').textContent = '✅';
                    step.style.color = '#10B981';
                }
            }, delays[i-1]);
        }
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();

        // Loading state
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        analyzeBtn.disabled = true;
        
        runProcessingSteps();

        try {
            const response = await fetch('/api/predict', {
                method: 'POST',
                body: new FormData(form),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                showError(data.error || 'Unknown error occurred.');
            } else {
                renderResults(data);
                if (data.session_id) loadHistory(); // refresh history if success
            }
        } catch (err) {
            showError('Cannot reach prediction server. Is app.py running?');
            console.error(err);
        } finally {
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            analyzeBtn.disabled = false;
            processingSteps.style.display = 'none';
        }
    });

    // ── Toast Error helper ──
    function showError(msg) {
        showToast(`⚠️ Error: ${msg}`, 'error');
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.padding = '1rem 1.5rem';
        toast.style.background = type === 'error' ? '#EF4444' : '#10B981';
        toast.style.color = 'white';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        toast.style.zIndex = '9999';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // ── Main Results Renderer ──
    function renderResults(data) {
        const { results, report, heatmap, qa_message } = data;

        // Switch placeholder → content
        resultsPlaceholder.classList.add('hidden');
        resultsContent.classList.remove('hidden');
        resultsContent.classList.add('fade-in');

        // ── Feature 1 & 4: Triage Banner ──
        const banner  = document.getElementById('triageBanner');
        const level   = document.getElementById('triageLevel');
        const referral = document.getElementById('triageReferral');
        const qa      = document.getElementById('qaMessage');

        banner.className = `triage-banner risk-${results.risk_level}`;
        level.textContent = `${results.risk_level} RISK`;
        document.getElementById('triageIcon').textContent = riskIcon(results.risk_level);

        if (results.referral_hours === 0) {
            referral.textContent = 'Action: Immediate referral required';
        } else if (results.referral_hours !== null && results.referral_hours !== undefined) {
            referral.textContent = `Referral window: within ${results.referral_hours} hours`;
        } else {
            referral.textContent = 'No urgent referral required';
        }
        qa.textContent = qa_message;

        // ── Feature 3: Confidence + Uncertainty ──
        document.getElementById('confidenceVal').textContent  = `${results.confidence}%`;
        document.getElementById('uncertaintyVal').textContent = `±${results.uncertainty_pct}%`;

        // ── Grad-CAM heatmap ──
        const heatmapImg = document.getElementById('heatmapImage');
        const originalImg = document.getElementById('originalImage');
        if (heatmapImg) heatmapImg.src = heatmap;
        
        // Ensure originalImg has the preview src
        if (originalImg) originalImg.src = document.getElementById('imagePreview').src;

        // Populate Structured JSON
        const jsonViewerContainer = document.getElementById('jsonViewerContainer');
        const jsonContent = document.getElementById('jsonContent');
        if (jsonViewerContainer && data.structured) {
            jsonViewerContainer.style.display = 'block';
            jsonContent.textContent = JSON.stringify(data.structured, null, 2);
        }

        // ── Feature 1: TB probability bar ──
        const tbPct = (parseFloat(results.tb_prob) * 100).toFixed(1);
        document.getElementById('probTB').textContent  = `${tbPct}%`;
        document.getElementById('fillTB').style.width  = `${tbPct}%`;

        const pnPct = (parseFloat(results.pneumonia_prob) * 100).toFixed(1);
        document.getElementById('probPneumonia').textContent = `${pnPct}%`;
        document.getElementById('fillPneumonia').style.width = `${pnPct}%`;

        // ── Feature 2: Radiological Findings ──
        renderFindings(results.radiological_findings || {});

        // ── Feature 8: Multilingual Report ──
        document.getElementById('reportTitle').textContent = report.title;
        const reportList = document.getElementById('reportList');
        reportList.innerHTML = '';

        report.data.forEach(item => {
            const el = document.createElement('div');
            el.className = 'report-item';
            const valClass = getValueClass(item.value);
            el.innerHTML = `
                <span class="r-label">${escHtml(item.label)}</span>
                <span class="r-val ${valClass}">${escHtml(item.value)}</span>
            `;
            reportList.appendChild(el);
        });

        // Add radiological sub-section to report if present
        if (report.radiological && report.radiological.length > 0) {
            const hdr = document.createElement('div');
            hdr.className = 'report-item';
            hdr.style.marginTop = '0.75rem';
            hdr.innerHTML = `<span class="r-label">Radiological Findings</span>
                <span class="r-val">${report.radiological.map(r => `${r.finding} (${(r.probability*100).toFixed(0)}%)`).join(' · ')}</span>`;
            reportList.appendChild(hdr);
        }
    }

    // ── Feature 2: Radiological Findings renderer ──
    function renderFindings(findingsObj) {
        const list = document.getElementById('findingsList');
        list.innerHTML = '';

        const entries = Object.entries(findingsObj);
        if (entries.length === 0) {
            list.innerHTML = '<span style="font-size:0.78rem;color:var(--muted)">No significant radiological findings</span>';
            return;
        }

        entries.sort((a, b) => b[1] - a[1]).forEach(([name, prob]) => {
            const pct = (prob * 100).toFixed(0);
            const el  = document.createElement('div');
            el.className = 'finding-item';
            el.innerHTML = `
                <span class="finding-name">${escHtml(name)}</span>
                <div class="finding-bar-track">
                    <div class="finding-bar-fill" style="width:0%" data-pct="${pct}"></div>
                </div>
                <span class="finding-prob">${pct}%</span>
            `;
            list.appendChild(el);
        });

        // Animate bars after render
        requestAnimationFrame(() => {
            list.querySelectorAll('.finding-bar-fill').forEach(bar => {
                bar.style.width = bar.dataset.pct + '%';
            });
        });
    }

    function copyText(text) {
        navigator.clipboard.writeText(text).then(() => {
            alert('Copied to clipboard!');
        }).catch(() => {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        });
    }

    // ── Helpers ──
    function riskIcon(level) {
        const icons = { CRITICAL: '🚨', HIGH: '⚠', MEDIUM: '!', LOW: '✓', ROUTINE: '✓' };
        return icons[level] || '!';
    }

    function getValueClass(value) {
        const v = value.toUpperCase();
        if (v.includes('CRITICAL') || v.includes('HIGH')) return 'danger';
        if (v.includes('MEDIUM'))  return 'warning';
        if (v.includes('LOW') || v.includes('ROUTINE') || v.includes('NORMAL')) return 'success';
        return '';
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Heatmap Toggle & Opacity ──
    const hmTabs = document.querySelectorAll('.hm-tab');
    const heatmapOpacity = document.getElementById('heatmapOpacity');
    const heatmapImage = document.getElementById('heatmapImage');
    const originalImage = document.getElementById('originalImage');

    hmTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            hmTabs.forEach(t => {
                t.classList.remove('active');
                t.style.background = 'white';
                t.style.color = '#64748B';
            });
            tab.classList.add('active');
            tab.style.background = '#EEF2FF';
            tab.style.color = '#4F46E5';

            if (tab.dataset.view === 'heatmap') {
                heatmapImage.style.opacity = heatmapOpacity.value;
                originalImage.style.opacity = '0';
            } else {
                heatmapImage.style.opacity = '0';
                originalImage.style.opacity = '1';
            }
        });
    });

    if (heatmapOpacity) {
        heatmapOpacity.addEventListener('input', (e) => {
            const activeTab = document.querySelector('.hm-tab.active');
            if (activeTab && activeTab.dataset.view === 'heatmap') {
                heatmapImage.style.opacity = e.target.value;
            }
        });
    }

    // ── Navigation Tabs Logic ──
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabViews = document.querySelectorAll('.tab-view');

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            navTabs.forEach(t => {
                t.classList.remove('active');
                t.style.borderBottomColor = 'transparent';
                t.style.opacity = '0.7';
            });
            tab.classList.add('active');
            tab.style.borderBottomColor = '#38BDF8';
            tab.style.opacity = '1';

            tabViews.forEach(v => v.style.display = 'none');
            const targetView = document.getElementById(tab.dataset.target);
            if (targetView) targetView.style.display = 'grid'; // main-grid
        });
    });

    // Set initial active tab styles
    const activeNavTab = document.querySelector('.nav-tab.active');
    if(activeNavTab) {
        activeNavTab.style.borderBottomColor = '#38BDF8';
        activeNavTab.style.opacity = '1';
    }

    // ── History Fetching Logic ──
    async function loadHistory() {
        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            if (data.success) {
                const list = document.getElementById('historyList');
                list.innerHTML = '';
                data.sessions.forEach(sess => {
                    const el = document.createElement('div');
                    el.style.background = '#F8FAFC';
                    el.style.padding = '1rem';
                    el.style.borderRadius = '0.5rem';
                    el.style.border = '1px solid #E2E8F0';
                    el.innerHTML = `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <strong>${escHtml(sess.patient_name || 'Unknown')} (Age: ${sess.patient_age || 'N/A'})</strong>
                            <span style="color: #64748B; font-size: 0.8rem;">${new Date(sess.timestamp).toLocaleString()}</span>
                        </div>
                        <div style="display: flex; gap: 1rem; font-size: 0.875rem;">
                            <span><span style="color: #64748B;">Diagnosis:</span> ${escHtml(sess.diagnosis)} (${sess.confidence}%)</span>
                            <span><span style="color: #64748B;">Risk:</span> <strong style="color: ${getRiskColorHex(sess.risk_level)};">${sess.risk_level}</strong></span>
                        </div>
                    `;
                    list.appendChild(el);
                });
            }
        } catch (e) {
            console.error('Failed to load history', e);
        }
    }

    function getRiskColorHex(level) {
        const colors = { CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#F59E0B', LOW: '#10B981', ROUTINE: '#06B6D4' };
        return colors[level] || '#94A3B8';
    }

    // Initial history load
    loadHistory();
});
