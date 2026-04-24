from flask import Flask, request, jsonify, send_from_directory
import os
import io
import base64
import json
from PIL import Image
import datetime
import uuid
import shelve

HISTORY_DB = 'scan_history.db'
from src.ruralx_pipeline import (
    RuralXModelSystem,
    ImageEnhancementPipeline,
    MultilingualReportGen,
    build_structured_output,
)

app = Flask(__name__, static_folder='static', template_folder='templates')

# ── Global system initialisation ──
print("Initializing RuralX AI System (v2 – Enhanced)...")
system = RuralXModelSystem()
print("System Initialized.")


# ──────────────────────────────────────────────────────────────
# Frontend
# ──────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('templates', 'index.html')

@app.route('/api/history', methods=['GET'])
def get_history():
    try:
        with shelve.open(HISTORY_DB) as db:
            sessions = []
            for key in sorted(db.keys(), reverse=True)[:50]:
                sessions.append(db[key])
        return jsonify({"success": True, "sessions": sessions})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/history/<session_id>', methods=['GET'])
def get_session(session_id):
    try:
        with shelve.open(HISTORY_DB) as db:
            if session_id in db:
                return jsonify({"success": True, "session": db[session_id]})
        return jsonify({"success": False, "error": "Session not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ──────────────────────────────────────────────────────────────
# Core Prediction Endpoint
# ──────────────────────────────────────────────────────────────

@app.route('/api/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({"success": False, "error": "No image provided"}), 400

    file            = request.files['image']
    language        = request.form.get('language', 'en')
    patient_age     = request.form.get('age', '')
    patient_symptoms = request.form.get('symptoms', '')
    patient_spo2    = request.form.get('spo2', '')
    haemoptysis     = request.form.get('haemoptysis', 'no') == 'yes'
    fever_days      = request.form.get('fever_days', '')

    image_bytes = file.read()

    # 1. Quality Assessment & Enhancement Pipeline
    # Toggles ESRGAN mock or Sharpening depending on frontend (defaulting to False/Lightweight)
    use_esrgan = request.form.get('use_esrgan', 'false').lower() == 'true'
    is_valid, processed_image_bytes, qa_report = ImageEnhancementPipeline.process_image(image_bytes, use_esrgan=use_esrgan)
    
    if not is_valid:
        return jsonify({"success": False, "error": f"Image Rejected: {qa_report.get('Status')} (Score: {qa_report.get('NewBlurScore', qa_report.get('BlurScore'))})", "qa_report": qa_report}), 400

    # 2. Prediction (with uncertainty)
    try:
        patient_name = request.form.get('patient_name', 'Unknown')
        image_pil = Image.open(io.BytesIO(processed_image_bytes)).convert('RGB')
        results   = system.predict(
            image_pil, 
            patient_name=patient_name, 
            patient_age=patient_age,
            patient_spo2=patient_spo2,
            haemoptysis=haemoptysis,
            fever_days=fever_days
        )
    except Exception as e:
        return jsonify({"success": False, "error": f"Model error: {str(e)}"}), 500

    # 3. Multilingual Report (Feature 8)
    report = MultilingualReportGen.generate_report(
        language=language,
        diagnosis=results['diagnosis'],
        confidence=results['confidence'],
        uncertainty=results['uncertainty_pct'],
        risk_level=results['risk_level'],
        recommendation=results['recommendation'],
        radiological_findings=results['radiological_findings'],
        tb_prob=results['tb_prob'],
        pneumonia_prob=results['pneumonia_prob'],
        referral_hours=results.get('referral_hours'),
    )

    # 4. Structured Output (Feature 7)
    structured = build_structured_output(
        patient_info={"age": patient_age, "spo2": patient_spo2, "symptoms": patient_symptoms},
        prediction=results,
    )

    # 5. Heatmap encoding
    heatmap_b64      = base64.b64encode(results['heatmap_bytes']).decode('utf-8')
    heatmap_data_url = f"data:image/jpeg;base64,{heatmap_b64}"

    session_id = str(uuid.uuid4())[:8]
    try:
        with shelve.open(HISTORY_DB) as db:
            db[session_id] = {
                "session_id": session_id,
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                "patient_name": request.form.get('patient_name', 'Unknown'),
                "patient_age": patient_age,
                "diagnosis": results['diagnosis'],
                "confidence": f"{results['confidence']:.1f}",
                "risk_level": results['risk_level'],
                "tb_prob": f"{results['tb_prob']:.4f}",
                "pneumonia_prob": f"{results['pneumonia_prob']:.4f}",
                "language": language,
            }
    except Exception:
        pass  # Never let history saving break the main response

    return jsonify({
        "success": True,
        "session_id": session_id,
        "results": {
            "diagnosis":             results['diagnosis'],
            "confidence":            f"{results['confidence']:.1f}",
            "uncertainty_pct":       f"{results['uncertainty_pct']:.1f}",
            "risk_level":            results['risk_level'],
            "tb_prob":               f"{results['tb_prob']:.4f}",
            "pneumonia_prob":        f"{results['pneumonia_prob']:.4f}",
            "cardiomegaly_prob":     f"{results.get('cardiomegaly_prob', 0):.4f}",
            "ctr_value":             results.get('ctr_value', 'N/A'),
            "referral_hours":        results.get('referral_hours'),
            "radiological_findings": results['radiological_findings'],
            "risk_color":            _risk_color(results['risk_level']),
        },
        "report":     report,
        "structured": structured,
        "heatmap":    heatmap_data_url,
        "qa_message": f"Status: {qa_report.get('Status')} | Blur Score: {qa_report.get('NewBlurScore', qa_report.get('BlurScore'))}",
    })


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _risk_color(risk_level: str) -> str:
    colors = {
        "CRITICAL": "#EF4444",
        "HIGH":     "#F97316",
        "MEDIUM":   "#F59E0B",
        "LOW":      "#10B981",
        "ROUTINE":  "#06B6D4",
    }
    return colors.get(risk_level, "#94A3B8")


# ──────────────────────────────────────────────────────────────
# Entry Point
# ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    os.makedirs('static', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    # Disabled reloader to prevent duplicate PyTorch model loading in memory
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
